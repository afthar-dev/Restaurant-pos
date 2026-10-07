export interface FloorTable {
  id: string;
  name: string;
  seats: number;
}

export interface FloorArea {
  id: string;
  name: string;
  sortOrder: number;
  tables: FloorTable[];
}
