-- PDF-Stundenplan Import Script
-- Nur die eindeutigsten Zuweisungen aus Franz-Stock-Realschule PDF

-- Prüfe bestehende Zuweisungen erst (should be 2)
-- SELECT COUNT(*) as existing FROM assignments WHERE teacher_id IN 
--   (SELECT id FROM teachers WHERE short_name IN ('BEU', 'BOE', 'DIR', 'DRE'));

-- BEU Zuweisungen (Englisch/Erdkunde/Geschichte)
-- BEU + 09d + EK (Erdkunde)
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name = '09d' AND s.short_name = 'EK';

-- BEU + 09d + E (Englisch) 
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 4, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name = '09d' AND s.short_name = 'E';

-- BEU + 09d + GE (Geschichte)
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name = '09d' AND s.short_name = 'GE';

-- BEU + 10a + EK
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name = '10a' AND s.short_name = 'EK';

-- BEU + 10a + E
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 4, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name = '10a' AND s.short_name = 'E';

-- BEU + 05c + E
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 4, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name = '05c' AND s.short_name = 'E';

-- BEU + 09c + EK
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name = '09c' AND s.short_name = 'EK';

-- BEU + 07a + EK, BEU + 07d + EK, BEU + 07b + EK
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BEU' AND c.name IN ('07a', '07d', '07b') AND s.short_name = 'EK';

-- BOE Zuweisungen (Deutsch)
-- BOE + 05b + D
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 5, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'BOE' AND c.name = '05b' AND s.short_name = 'D';

-- DIR Zuweisungen (Mathematik/Physik/Informatik)
-- DIR + 07a + M, DIR + 07a + PH
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 
  CASE WHEN s.short_name = 'M' THEN 4 ELSE 2 END, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'DIR' AND c.name = '07a' AND s.short_name IN ('M', 'PH');

-- DIR + 08b + M
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 4, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'DIR' AND c.name = '08b' AND s.short_name = 'M';

-- DIR Physik Zuweisungen: 07d, 07e, 08d, 07b + PH
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'DIR' AND c.name IN ('07d', '07e', '08d', '07b') AND s.short_name = 'PH';

-- DIR Informatik Zuweisungen: 06d, 06a, 06b, 06c + IF
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 1, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'DIR' AND c.name IN ('06d', '06a', '06b', '06c') AND s.short_name = 'IF';

-- DRE Zuweisungen (Politik/Erdkunde)
-- DRE + 10d + PK
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'DRE' AND c.name = '10d' AND s.short_name = 'PK';

-- DRE + 10d + EK
INSERT INTO assignments (teacher_id, class_id, subject_id, hours_per_week, semester)
SELECT t.id, c.id, s.id, 2, '1'
FROM teachers t, classes c, subjects s
WHERE t.short_name = 'DRE' AND c.name = '10d' AND s.short_name = 'EK';