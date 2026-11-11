import { createContext, useContext } from 'react';
import { departments, employees, currentEmployee } from './data';
import type { Employee } from './types';
export interface DepartmentEntry { id: string; boardId: string; name: string; code: string; color: string; stamp: string; isGeneral?: boolean }
export interface DirectoryValue {
  departments: DepartmentEntry[]; employees: Record<string, Employee>; currentEmployee: Employee;
  allDepartments: DepartmentEntry[];
  isAdmin: boolean; onProfile: () => void; onAdmin: () => void; onLogout: () => void;
}
export const DirectoryContext = createContext<DirectoryValue>({
  departments: departments.map(department => ({ ...department, boardId: department.id, isGeneral: department.id === 'general' })),
  allDepartments: departments.map(department => ({ ...department, boardId: department.id, isGeneral: department.id === 'general' })),
  employees, currentEmployee, isAdmin: false, onProfile: () => {}, onAdmin: () => {}, onLogout: () => {},
});
export const useDirectory = () => useContext(DirectoryContext);
