import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import { saveStaff, toggleStaffArchive } from './api';
import { staffKeys } from './keys';
import type { Staff } from './types';

export const useSaveStaff = (existing: Staff | null, onSaved: () => void) =>
  useInvalidatingMutation({
    mutationFn: (body: object) => saveStaff(existing, body),
    invalidates: [staffKeys.list],
    onSuccess: onSaved,
    afterRefresh: true,
  });

export const useToggleStaffArchive = (onDone: () => void) =>
  useInvalidatingMutation({
    mutationFn: toggleStaffArchive,
    invalidates: [staffKeys.list],
    onSuccess: onDone,
  });
