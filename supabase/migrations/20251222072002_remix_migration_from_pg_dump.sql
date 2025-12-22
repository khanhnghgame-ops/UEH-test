CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'leader',
    'member'
);


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'TODO',
    'IN_PROGRESS',
    'DONE',
    'VERIFIED'
);


--
-- Name: check_admin_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_admin_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Nếu là tài khoản admin đặc biệt theo email cố định
  IF NEW.email = 'khanhngh.ueh@gmail.com' THEN
    -- Đảm bảo hồ sơ được duyệt và đồng bộ thông tin cơ bản
    UPDATE public.profiles
    SET 
      is_approved = true,
      full_name = COALESCE(full_name, 'Nguyễn Hoàng Khánh'),
      email = NEW.email
    WHERE id = NEW.id;

    -- Chỉ cấp quyền admin (không cần leader vì admin đã bao gồm quyền cao nhất)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: get_email_by_student_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_email_by_student_id(_student_id text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT email FROM public.profiles WHERE student_id = _student_id LIMIT 1;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Tạo bản ghi profiles tối thiểu để tránh lỗi signup
  INSERT INTO public.profiles (id, student_id, full_name, email, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''), -- tạm thời dùng email làm student_id nếu chưa có metadata
    '',                      -- full_name sẽ được cập nhật sau trong ứng dụng
    NEW.email,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;


--
-- Name: is_group_leader(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_leader(_user_id uuid, _group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id 
    AND group_id = _group_id 
    AND role IN ('leader', 'admin')
  ) OR public.is_admin(_user_id)
$$;


--
-- Name: is_group_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id
  )
$$;


--
-- Name: is_leader(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_leader(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'leader'
  )
$$;


--
-- Name: is_task_assignee(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_task_assignee(_user_id uuid, _task_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignments
    WHERE user_id = _user_id AND task_id = _task_id
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_name text NOT NULL,
    action text NOT NULL,
    action_type text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'member'::public.app_role NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    class_code text,
    instructor_name text,
    instructor_email text,
    leader_id uuid,
    zalo_link text,
    additional_info text
);


--
-- Name: member_stage_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_stage_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    user_id uuid NOT NULL,
    average_score numeric(5,2),
    late_task_count integer DEFAULT 0 NOT NULL,
    early_submission_bonus boolean DEFAULT false NOT NULL,
    bug_hunter_bonus boolean DEFAULT false NOT NULL,
    adjusted_score numeric(5,2),
    k_coefficient numeric(3,2) DEFAULT 1.0,
    final_stage_score numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pending_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    status public.approval_status DEFAULT 'pending'::public.approval_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by uuid
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    student_id text NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    is_approved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL
);


--
-- Name: stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    order_index integer DEFAULT 0 NOT NULL,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: submission_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submission_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    submission_link text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);


--
-- Name: task_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    base_score numeric(5,2) DEFAULT 100 NOT NULL,
    late_penalty numeric(5,2) DEFAULT 0 NOT NULL,
    review_penalty numeric(5,2) DEFAULT 0 NOT NULL,
    review_count integer DEFAULT 0 NOT NULL,
    early_bonus boolean DEFAULT false NOT NULL,
    bug_hunter_bonus boolean DEFAULT false NOT NULL,
    final_score numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status public.task_status DEFAULT 'TODO'::public.task_status NOT NULL,
    deadline timestamp with time zone,
    submission_link text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stage_id uuid
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: member_stage_scores member_stage_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_stage_scores
    ADD CONSTRAINT member_stage_scores_pkey PRIMARY KEY (id);


--
-- Name: member_stage_scores member_stage_scores_stage_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_stage_scores
    ADD CONSTRAINT member_stage_scores_stage_id_user_id_key UNIQUE (stage_id, user_id);


--
-- Name: pending_approvals pending_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_approvals
    ADD CONSTRAINT pending_approvals_pkey PRIMARY KEY (id);


--
-- Name: pending_approvals pending_approvals_user_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_approvals
    ADD CONSTRAINT pending_approvals_user_id_group_id_key UNIQUE (user_id, group_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_student_id_key UNIQUE (student_id);


--
-- Name: stages stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_pkey PRIMARY KEY (id);


--
-- Name: submission_history submission_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_history
    ADD CONSTRAINT submission_history_pkey PRIMARY KEY (id);


--
-- Name: task_assignments task_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_pkey PRIMARY KEY (id);


--
-- Name: task_assignments task_assignments_task_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_task_id_user_id_key UNIQUE (task_id, user_id);


--
-- Name: task_scores task_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_scores
    ADD CONSTRAINT task_scores_pkey PRIMARY KEY (id);


--
-- Name: task_scores task_scores_task_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_scores
    ADD CONSTRAINT task_scores_task_id_user_id_key UNIQUE (task_id, user_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_activity_logs_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_action_type ON public.activity_logs USING btree (action_type);


--
-- Name: idx_activity_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at DESC);


--
-- Name: idx_activity_logs_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_group_id ON public.activity_logs USING btree (group_id);


--
-- Name: idx_activity_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);


--
-- Name: profiles on_profile_created_check_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created_check_admin AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.check_admin_user();


--
-- Name: groups update_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: member_stage_scores update_member_stage_scores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_member_stage_scores_updated_at BEFORE UPDATE ON public.member_stage_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stages update_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stages_updated_at BEFORE UPDATE ON public.stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: task_scores update_task_scores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_task_scores_updated_at BEFORE UPDATE ON public.task_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_logs activity_logs_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: groups groups_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES auth.users(id);


--
-- Name: member_stage_scores member_stage_scores_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_stage_scores
    ADD CONSTRAINT member_stage_scores_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: member_stage_scores member_stage_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_stage_scores
    ADD CONSTRAINT member_stage_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pending_approvals pending_approvals_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_approvals
    ADD CONSTRAINT pending_approvals_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: pending_approvals pending_approvals_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_approvals
    ADD CONSTRAINT pending_approvals_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id);


--
-- Name: pending_approvals pending_approvals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_approvals
    ADD CONSTRAINT pending_approvals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: stages stages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: submission_history submission_history_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_history
    ADD CONSTRAINT submission_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: submission_history submission_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submission_history
    ADD CONSTRAINT submission_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_assignments task_assignments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_assignments task_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: task_scores task_scores_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_scores
    ADD CONSTRAINT task_scores_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_scores task_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_scores
    ADD CONSTRAINT task_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: submission_history Assignees can insert submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assignees can insert submissions" ON public.submission_history FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.is_task_assignee(auth.uid(), task_id)));


--
-- Name: tasks Assignees can update task status and submission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assignees can update task status and submission" ON public.tasks FOR UPDATE USING (public.is_task_assignee(auth.uid(), id)) WITH CHECK (public.is_task_assignee(auth.uid(), id));


--
-- Name: groups Group leaders can delete groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group leaders can delete groups" ON public.groups FOR DELETE TO authenticated USING (public.is_group_leader(auth.uid(), id));


--
-- Name: groups Group leaders can update groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group leaders can update groups" ON public.groups FOR UPDATE TO authenticated USING (public.is_group_leader(auth.uid(), id));


--
-- Name: task_scores Group members can view scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view scores" ON public.task_scores FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_scores.task_id) AND public.is_group_member(auth.uid(), t.group_id)))) OR public.is_admin(auth.uid())));


--
-- Name: member_stage_scores Group members can view stage scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view stage scores" ON public.member_stage_scores FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.stages s
  WHERE ((s.id = member_stage_scores.stage_id) AND public.is_group_member(auth.uid(), s.group_id)))) OR public.is_admin(auth.uid())));


--
-- Name: stages Group members can view stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view stages" ON public.stages FOR SELECT TO authenticated USING ((public.is_group_member(auth.uid(), group_id) OR public.is_admin(auth.uid())));


--
-- Name: submission_history Group members can view submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view submissions" ON public.submission_history FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = submission_history.task_id) AND public.is_group_member(auth.uid(), t.group_id)))) OR public.is_admin(auth.uid())));


--
-- Name: task_assignments Group members can view task assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view task assignments" ON public.task_assignments FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_assignments.task_id) AND public.is_group_member(auth.uid(), t.group_id)))) OR public.is_admin(auth.uid())));


--
-- Name: tasks Group members can view tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view tasks" ON public.tasks FOR SELECT TO authenticated USING ((public.is_group_member(auth.uid(), group_id) OR public.is_admin(auth.uid())));


--
-- Name: groups Leaders and admins can create groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders and admins can create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'leader'::public.app_role) OR public.is_admin(auth.uid())));


--
-- Name: activity_logs Leaders and admins can delete activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders and admins can delete activity logs" ON public.activity_logs FOR DELETE USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'leader'::public.app_role)));


--
-- Name: activity_logs Leaders and admins can insert activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders and admins can insert activity logs" ON public.activity_logs FOR INSERT WITH CHECK ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'leader'::public.app_role) OR (user_id = auth.uid())));


--
-- Name: activity_logs Leaders and admins can view activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders and admins can view activity logs" ON public.activity_logs FOR SELECT USING ((public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'leader'::public.app_role)));


--
-- Name: tasks Leaders can create tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_group_leader(auth.uid(), group_id));


--
-- Name: tasks Leaders can delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can delete tasks" ON public.tasks FOR DELETE TO authenticated USING (public.is_group_leader(auth.uid(), group_id));


--
-- Name: group_members Leaders can manage group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage group members" ON public.group_members TO authenticated USING (public.is_group_leader(auth.uid(), group_id));


--
-- Name: task_scores Leaders can manage scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage scores" ON public.task_scores TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_scores.task_id) AND public.is_group_leader(auth.uid(), t.group_id)))));


--
-- Name: member_stage_scores Leaders can manage stage scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage stage scores" ON public.member_stage_scores TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.stages s
  WHERE ((s.id = member_stage_scores.stage_id) AND public.is_group_leader(auth.uid(), s.group_id)))));


--
-- Name: stages Leaders can manage stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage stages" ON public.stages TO authenticated USING (public.is_group_leader(auth.uid(), group_id));


--
-- Name: task_assignments Leaders can manage task assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage task assignments" ON public.task_assignments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_assignments.task_id) AND public.is_group_leader(auth.uid(), t.group_id)))));


--
-- Name: pending_approvals Leaders can process approval requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can process approval requests" ON public.pending_approvals FOR UPDATE TO authenticated USING ((public.is_group_leader(auth.uid(), group_id) OR public.is_admin(auth.uid())));


--
-- Name: tasks Leaders can update all task fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can update all task fields" ON public.tasks FOR UPDATE USING (public.is_group_leader(auth.uid(), group_id));


--
-- Name: group_members Members can view group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view group members" ON public.group_members FOR SELECT TO authenticated USING ((public.is_group_member(auth.uid(), group_id) OR public.is_admin(auth.uid())));


--
-- Name: groups Members can view their groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their groups" ON public.groups FOR SELECT TO authenticated USING ((public.is_group_member(auth.uid(), id) OR public.is_admin(auth.uid())));


--
-- Name: user_roles Only admin can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admin can manage roles" ON public.user_roles TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: pending_approvals Users can create approval requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create approval requests" ON public.pending_approvals FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: profiles Users can view all approved profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all approved profiles" ON public.profiles FOR SELECT TO authenticated USING (((is_approved = true) OR (id = auth.uid()) OR public.is_admin(auth.uid())));


--
-- Name: pending_approvals Users can view own approval requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own approval requests" ON public.pending_approvals FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_group_leader(auth.uid(), group_id) OR public.is_admin(auth.uid())));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: member_stage_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_stage_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

--
-- Name: submission_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submission_history ENABLE ROW LEVEL SECURITY;

--
-- Name: task_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;