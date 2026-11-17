import type { DepartmentId, Employee, PresetId, StickyNoteData } from './types';
import { createPaperSeed } from './paper';

export const departments: { id: DepartmentId; name: string; code: string; color: string; stamp: string }[] = [
  { id: 'it', name: 'IT-отдел', code: 'SYS', color: '#2760db', stamp: 'IT-ОТДЕЛ' },
  { id: 'accounting', name: 'Бухгалтерия', code: 'FIN', color: '#e49b00', stamp: 'БУХГАЛТЕРИЯ' },
  { id: 'legal', name: 'Юридический отдел', code: 'LAW', color: '#9463db', stamp: 'ЮРИДИЧЕСКИЙ ОТДЕЛ' },
  { id: 'hr', name: 'Отдел кадров', code: 'HR', color: '#00a87b', stamp: 'ОТДЕЛ КАДРОВ' },
  { id: 'security', name: 'Безопасность', code: 'SEC', color: '#da3539', stamp: 'СЛУЖБА БЕЗОПАСНОСТИ' },
  { id: 'records', name: 'Документооборот', code: 'DOC', color: '#009d98', stamp: 'ДОКУМЕНТООБОРОТ' },
  { id: 'general', name: 'Общая доска', code: 'ALL', color: '#aeb3be', stamp: 'ОБЩАЯ ДОСКА' },
];

export const presets: Record<PresetId, { name: string; fastening: 'pin' | 'clip' | 'tape' | 'fold'; color: string }> = {
  yellow: { name: 'Жёлтый с кнопкой', fastening: 'pin', color: '#f3dfa3' },
  mint: { name: 'Мятный со скрепкой', fastening: 'clip', color: '#cbe2c4' },
  pink: { name: 'Розовый со скотчем', fastening: 'tape', color: '#edc3c4' },
  blue: { name: 'Голубой с кнопкой', fastening: 'pin', color: '#c3d9ed' },
  cream: { name: 'Кремовый с уголком', fastening: 'fold', color: '#efdfbd' },
  lavender: { name: 'Космос', fastening: 'pin', color: '#d9c8ec' },
  peach: { name: 'Хороший день', fastening: 'clip', color: '#f0cda9' },
  sea: { name: 'Морской бриз', fastening: 'tape', color: '#bfe0d8' },
  sage: { name: 'Тихое утро', fastening: 'fold', color: '#d9dfb9' },
  berry: { name: 'Цветочная почта', fastening: 'clip', color: '#e5bfd5' },
};

export const employees: Record<string, Employee> = {
  anna: { id: 'anna', name: 'Анна', label: 'Анна (Бухгалтерия)', department: 'accounting', avatar: '/assets/avatars/avatar-7.svg', preset: 'yellow' },
  denis: { id: 'denis', name: 'Денис', label: 'Денис (IT-отдел)', department: 'it', avatar: '/assets/avatars/avatar-1.svg', preset: 'blue' },
  elena: { id: 'elena', name: 'Елена', label: 'Елена (Юристы)', department: 'legal', avatar: '/assets/avatars/avatar-8.svg', preset: 'mint' },
  maxim: { id: 'maxim', name: 'Максим', label: 'Максим (Безопасность)', department: 'security', avatar: '/assets/avatars/avatar-2.svg', preset: 'cream' },
  olga: { id: 'olga', name: 'Ольга', label: 'Ольга (Кадры)', department: 'hr', avatar: '/assets/avatars/avatar-9.svg', preset: 'pink' },
  maria: { id: 'maria', name: 'Мария', label: 'Мария (Канцелярия)', department: 'records', avatar: '/assets/avatars/avatar-10.svg', preset: 'blue' },
  victor: { id: 'victor', name: 'Виктор', label: 'Виктор (Бухгалтерия)', department: 'accounting', avatar: '/assets/avatars/avatar-3.svg', preset: 'cream' },
  konstantin: { id: 'konstantin', name: 'Константин', label: 'Константин (IT-админ)', department: 'it', avatar: '/assets/avatars/avatar-4.svg', preset: 'yellow' },
};

export const currentEmployee = employees.konstantin;

const initial: StickyNoteData[] = [
  { id: 'anna-1', boardId: 'it', authorId: 'anna', time: '10:24', text: 'Не работает выгрузка отчёта из 1С. Посмотрите, пожалуйста, баланс за 3 квартал горит.', x: 38, y: 92, rotation: -2.8, read: false, done: false, attachment: { name: 'screenshot_1c_error.png', caption: 'СКРИНШОТ ОШИБКИ · 412 КБ', kind: 'image' } },
  { id: 'denis-1', boardId: 'it', authorId: 'denis', time: '10:48', text: 'Исправили настройки шлюза 1С. Попробуйте сформировать выгрузку ещё раз, должно работать.', x: 26, y: 0, rotation: 3.2, read: false, done: false, parentId: 'anna-1' },
  { id: 'elena-1', boardId: 'it', authorId: 'elena', time: 'Вчера, 16:40', text: 'Нужен срочный доступ к архиву договоров за октябрь на общем сетевом диске для налоговой проверки.', x: 370, y: 98, rotation: 0.8, read: false, done: false },
  { id: 'maxim-1', boardId: 'it', authorId: 'maxim', time: '09:15', text: 'Плановый аудит: проверьте права доступа уволенных сотрудников к общей сетевой папке /Shared/Confidential до конца дня.', x: 682, y: 94, rotation: -1.8, read: false, done: false },
  { id: 'olga-1', boardId: 'it', authorId: 'olga', time: '11:05', text: 'В понедельник выходит ведущий аналитик. Подключите корпоративную почту m.ivanov@company.ru и настройте рабочее место №42.', x: 34, y: 534, rotation: 1.4, read: false, done: false },
  { id: 'maria-1', boardId: 'it', authorId: 'maria', time: 'Сегодня, 08:30', text: 'Обновили типовые шаблоны служебных записок и приказов на портале. Ссылка и регламент уже в архиве.', x: 368, y: 528, rotation: -2.4, read: true, done: true, attachment: { name: 'templates_2025.docx', caption: 'РЕГЛАМЕНТ · 1,2 МБ', kind: 'document' } },
  { id: 'victor-1', boardId: 'it', authorId: 'victor', time: 'Вчера, 14:12', text: 'Замените, пожалуйста, картридж в сетевом МФУ HP в кабинете 304, выдает полосы при печати накладных.', x: 682, y: 528, rotation: 1.1, read: true, done: true },
  { id: 'konstantin-1', boardId: 'it', authorId: 'konstantin', time: '08:00', text: 'Плановые технические работы на почтовом сервере сегодня с 21:00 до 22:30. Возможны кратковременные перебои в доступе.', x: 40, y: 824, rotation: -2, read: true, done: false, notice: 'При инцидентах пишите в резервный корпоративный канал @it_incident.', announcement: true },
];

export function createInitialNotes(): StickyNoteData[] {
  const notes = initial.map(note => ({ ...note }));
  // Отдельные экземпляры демонстрационных записок на досках отделов.
  for (const department of departments.filter(item => item.id !== 'it' && item.id !== 'general')) {
    const roots = initial.filter(note => !note.parentId && employees[note.authorId].department === department.id);
    roots.forEach((root, index) => {
      const id = `${department.id}-${root.id}`;
      notes.push({ ...root, id, boardId: department.id, x: 40 + index * 330, y: 94 });
      initial.filter(note => note.parentId === root.id).forEach(reply => notes.push({ ...reply, id: `${department.id}-${reply.id}`, boardId: department.id, parentId: id }));
    });
  }
  return notes.map(note => ({ ...note, paperSeed: createPaperSeed() }));
}
