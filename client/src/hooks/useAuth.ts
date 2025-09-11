import { useQuery } from "@tanstack/react-query";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  profileImageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
  };
}