import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Google OAuth Configuration - from environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error("Google OAuth credentials not provided in environment variables");
}

// Get callback URL based on environment
function getCallbackURL(): string {
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
  if (domain.includes('localhost')) {
    return `http://${domain}/api/auth/google/callback`;
  }
  return `https://${domain}/api/auth/google/callback`;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(user: any, profile: any, accessToken: string) {
  user.profile = profile;
  user.accessToken = accessToken;
  user.email = profile.emails?.[0]?.value;
  user.displayName = profile.displayName;
}

async function upsertUser(profile: any) {
  // Check if user has a valid invitation
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new Error("E-Mail-Adresse nicht verfügbar. Bitte verwenden Sie ein Konto mit gültiger E-Mail-Adresse.");
  }

  // Check for invitation
  const invitation = await storage.getInvitationByEmail(email);
  if (!invitation) {
    throw new Error(`Keine Einladung für ${email} gefunden. Bitte kontaktieren Sie einen Administrator für eine Einladung.`);
  }

  if (invitation.used) {
    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (!existingUser) {
      throw new Error(`Die Einladung für ${email} wurde bereits verwendet. Bitte kontaktieren Sie einen Administrator.`);
    }
    // User exists and invitation was already used - that's OK, let them log in
    return;
  }

  if (invitation.expiresAt < new Date()) {
    throw new Error(`Die Einladung für ${email} ist abgelaufen. Bitte kontaktieren Sie einen Administrator für eine neue Einladung.`);
  }

  // Create or update user
  const userData = {
    id: profile.id,
    email: email,
    firstName: profile.name?.givenName,
    lastName: profile.name?.familyName,
    profileImageUrl: profile.photos?.[0]?.value,
    role: invitation.role,
  };

  await storage.upsertUser(userData);

  // Mark invitation as used
  await storage.markInvitationUsed(invitation.id, profile.id);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: getCallbackURL()
  }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      const user = { profile, accessToken, refreshToken };
      updateUserSession(user, profile, accessToken);
      await upsertUser(profile);
      done(null, user);
    } catch (error) {
      console.error("Authentication error:", error);
      done(error, false);
    }
  }));

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // Google OAuth routes
  app.get("/api/login", (req, res, next) => {
    passport.authenticate('google', { 
      scope: ['profile', 'email'],
      prompt: 'select_account' 
    })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate('google', {
      successRedirect: "/",
      failureRedirect: "/login"
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // For Google OAuth, we don't need token refresh like with OIDC
  // User is valid if session exists and is authenticated
  return next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if user has admin role
  try {
    const email = user.profile?.emails?.[0]?.value;
    if (!email) {
      return res.status(403).json({ message: "Access denied - no email found" });
    }

    const dbUser = await storage.getUserByEmail(email);
    if (!dbUser || dbUser.role !== 'admin') {
      return res.status(403).json({ message: "Access denied - admin role required" });
    }

    return next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    return res.status(500).json({ message: "Error checking permissions" });
  }
};