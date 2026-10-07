import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import { addStation, archivePrinter, archiveStation, renameStation, savePrinter } from './api';
import { kitchenSetupKeys } from './keys';
import type { Printer } from './types';

const { printers, stations } = kitchenSetupKeys;

export const useAddStation = (onAdded: () => void) =>
  useInvalidatingMutation({ mutationFn: addStation, invalidates: [stations], onSuccess: onAdded });

/** Printers show their station's name, so they refresh too. */
export const useRenameStation = (onRenamed: () => void) =>
  useInvalidatingMutation({
    mutationFn: renameStation,
    invalidates: [stations, printers],
    onSuccess: onRenamed,
  });

export const useArchiveStation = (onArchived: () => void) =>
  useInvalidatingMutation({
    mutationFn: archiveStation,
    invalidates: [stations],
    onSuccess: onArchived,
  });

export const useSavePrinter = (existing: Printer | null, onSaved: () => void) =>
  useInvalidatingMutation({
    mutationFn: (body: object) => savePrinter(existing, body),
    invalidates: [printers],
    onSuccess: onSaved,
    afterRefresh: true,
  });

export const useArchivePrinter = (onArchived: () => void) =>
  useInvalidatingMutation({
    mutationFn: archivePrinter,
    invalidates: [printers],
    onSuccess: onArchived,
  });
