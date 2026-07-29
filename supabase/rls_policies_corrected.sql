-- =============================================================
-- CORRECTED RLS POLICIES — Roster Duty Portal
-- =============================================================
-- 
-- BUG FIX SUMMARY
-- ───────────────
-- ❌ OLD: submissions_select_own tried employee_id = auth.uid()
--    → WRONG because employee_id references roster.employees.id
--      (gen_random_uuid), NOT auth.users.id (Supabase Auth UUID).
--      These are two completely separate identity domains.
--
-- ✅ NEW: All authenticated users can SELECT roster_submissions
--    (matching the current app behavior: the admin panel password
--    gate controls access, not per-user filtering). No broken
--    comparison between employee_id and auth.uid().
--
-- ❌ OLD: assumed employee_id could be compared to auth.uid()
-- ✅ NEW: admin role checks use EXISTS subquery against
--    roster.profiles JOINED on auth.uid() — the ONLY correct
--    way to link auth users to application roles.
--
-- DATA MODEL CLARIFICATION
-- ────────────────────────
--   auth.users (login identities)
--       └── 1:1 ── roster.profiles (application roles)
--                       ↑ id = auth.users.id  ← ONLY valid auth link
--   
--   roster.employees (18 duty-assignable people)
--       └── PK = gen_random_uuid()  ← NOT auth.users.id!
--   
--   roster.roster_submissions
--       └── employee_id → roster.employees.id  ← domain reference
--       └── NO direct FK to auth.users (no "submitted_by" column)
-- =============================================================

-- First, drop all existing policies on these tables
DROP POLICY IF EXISTS employees_select_all   ON roster.employees;
DROP POLICY IF EXISTS employees_insert_admin ON roster.employees;
DROP POLICY IF EXISTS employees_update_admin ON roster.employees;
DROP POLICY IF EXISTS employees_delete_admin ON roster.employees;

DROP POLICY IF EXISTS submissions_select_admin ON roster.roster_submissions;
DROP POLICY IF EXISTS submissions_select_own   ON roster.roster_submissions;
DROP POLICY IF EXISTS submissions_insert_all   ON roster.roster_submissions;
DROP POLICY IF EXISTS submissions_update_admin ON roster.roster_submissions;
DROP POLICY IF EXISTS submissions_delete_admin ON roster.roster_submissions;

DROP POLICY IF EXISTS settings_select_all    ON roster.admin_settings;
DROP POLICY IF EXISTS settings_insert_admin  ON roster.admin_settings;
DROP POLICY IF EXISTS settings_update_admin  ON roster.admin_settings;

DROP POLICY IF EXISTS profiles_select_own    ON roster.profiles;
DROP POLICY IF EXISTS profiles_select_admin  ON roster.profiles;
DROP POLICY IF EXISTS profiles_insert_admin  ON roster.profiles;

-- =============================================================
-- 1. ROSTER.EMPLOYEES
-- =============================================================
-- All authenticated users can read the employee list (populates
-- the user panel dropdown). Only admins can modify.
-- =============================================================

CREATE POLICY employees_select_authenticated ON roster.employees
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY employees_insert_admin ON roster.employees
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY employees_update_admin ON roster.employees
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY employees_delete_admin ON roster.employees
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =============================================================
-- 2. ROSTER.ROSTER_SUBMISSIONS
-- =============================================================
-- KEY CORRECTION: No policy references employee_id = auth.uid()
-- because employee_id points to roster.employees (domain identity),
-- NOT auth.users (login identity).
--
-- Current app behavior:
--   - Anyone who passes the password gate sees ALL submissions
--   - No per-user data isolation exists
-- Therefore: all authenticated users can SELECT and INSERT.
-- Only admins can UPDATE and DELETE.
-- =============================================================

CREATE POLICY submissions_select_authenticated ON roster.roster_submissions
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY submissions_insert_authenticated ON roster.roster_submissions
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND EXISTS (
            -- Ensure employee_id references a real employee
            SELECT 1 FROM roster.employees WHERE id = employee_id
        )
    );

CREATE POLICY submissions_update_admin ON roster.roster_submissions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY submissions_delete_admin ON roster.roster_submissions
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =============================================================
-- 3. ROSTER.ADMIN_SETTINGS
-- =============================================================
-- All authenticated users can read settings (they're rendered
-- in the PDF headers). Only admins can modify.
-- =============================================================

CREATE POLICY settings_select_authenticated ON roster.admin_settings
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY settings_insert_admin ON roster.admin_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY settings_update_admin ON roster.admin_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =============================================================
-- 4. ROSTER.PROFILES
-- =============================================================
-- Users read their own profile. Admins read all profiles.
-- Any authenticated user can insert their own profile on first
-- login (self-registration as 'user' role).
-- Only admins can update profiles (e.g. promote user→admin).
-- =============================================================

-- A user can read their own profile
CREATE POLICY profiles_select_own ON roster.profiles
    FOR SELECT
    USING (id = auth.uid());

-- An admin can read all profiles
CREATE POLICY profiles_select_admin ON roster.profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Allow self-registration: a user can insert their own profile
-- on first signup (avoids chicken-and-egg problem for new users)
CREATE POLICY profiles_insert_self ON roster.profiles
    FOR INSERT
    WITH CHECK (id = auth.uid());

-- Only admins can update profiles (change roles, names, etc.)
CREATE POLICY profiles_update_admin ON roster.profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM roster.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- =============================================================
-- VERIFICATION QUERIES
-- =============================================================
-- Run these to confirm policies are correct:
--
-- SELECT schemaname, tablename, policyname, permissive, roles,
--        cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'roster'
-- ORDER BY tablename, policyname;
--
-- =============================================================
-- END OF CORRECTED RLS POLICIES
-- =============================================================
