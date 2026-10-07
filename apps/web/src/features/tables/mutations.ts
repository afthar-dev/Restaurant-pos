import type { TableCode } from '@/features/printing';
import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import {
  addArea,
  addTable,
  archiveArea,
  archiveTable,
  renameArea,
  rotateTableCode,
  updateTable,
} from './api';
import { tableKeys } from './keys';
import type { FloorArea, FloorTable } from './types';

const { layout } = tableKeys;

export const useAddArea = (onAdded: () => void) =>
  useInvalidatingMutation({ mutationFn: addArea, invalidates: [layout], onSuccess: onAdded });

export const useRenameArea = (onRenamed: () => void) =>
  useInvalidatingMutation({ mutationFn: renameArea, invalidates: [layout], onSuccess: onRenamed });

export const useAddTable = (onAdded: () => void) =>
  useInvalidatingMutation({ mutationFn: addTable, invalidates: [layout], onSuccess: onAdded });

export const useUpdateTable = (table: FloorTable, onSaved: () => void) =>
  useInvalidatingMutation({
    mutationFn: (body: object) => updateTable(table, body),
    invalidates: [layout],
    onSuccess: onSaved,
    afterRefresh: true,
  });

export type LayoutEntry = { kind: 'area'; area: FloorArea } | { kind: 'table'; table: FloorTable };

/** Archives an area or a single table. */
export const useArchiveLayoutEntry = (onArchived: () => void) =>
  useInvalidatingMutation({
    mutationFn: (entry: LayoutEntry) =>
      entry.kind === 'area' ? archiveArea(entry.area) : archiveTable(entry.table),
    invalidates: [layout],
    onSuccess: onArchived,
  });

export const useRotateTableCode = (onRotated: (renewed: TableCode) => void) =>
  useInvalidatingMutation({
    mutationFn: rotateTableCode,
    invalidates: [tableKeys.qrCodes],
    onSuccess: (result, table) => onRotated({ ...table, qrToken: result.qrToken }),
  });
