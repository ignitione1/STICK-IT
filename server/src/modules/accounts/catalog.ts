export const styles = [
  { id: 'yellow', name: 'Тёплая классика', description: 'Медовая бумага и маленькие искры' },
  { id: 'mint', name: 'Ботаника', description: 'Мята и лёгкие силуэты листьев' },
  { id: 'pink', name: 'Розовое письмо', description: 'Пудровый оттенок и сердечки' },
  { id: 'blue', name: 'Небесный', description: 'Голубая бумага и воздушные облака' },
  { id: 'cream', name: 'Бумажный архив', description: 'Сливочная бумага и книжные зарисовки' },
  { id: 'lavender', name: 'Космос', description: 'Лаванда, планеты и россыпь звёзд' },
  { id: 'peach', name: 'Хороший день', description: 'Персиковая бумага и улыбки' },
  { id: 'sea', name: 'Морской бриз', description: 'Бирюзовый оттенок и мягкие волны' },
  { id: 'sage', name: 'Тихое утро', description: 'Шалфей, чашка кофе и неспешные мысли' },
  { id: 'berry', name: 'Цветочная почта', description: 'Ягодный зефир и полевые цветы' },
] as const;
export const fastenings = [
  { id: 'pin', name: 'Кнопка', description: 'Маленький солнечный акцент' },
  { id: 'clip', name: 'Скрепка', description: 'Серебристая канцелярская классика' },
  { id: 'tape', name: 'Скотч', description: 'Полупрозрачная розовая лента' },
  { id: 'fold', name: 'Бумажная лента', description: 'Тёплая матовая полоска' },
] as const;
export const avatars = Array.from({ length: 12 }, (_, index) => ({
  id: `avatar-${index + 1}`, url: `/assets/avatars/avatar-${index + 1}.svg`,
  name: `${index < 6 ? 'Мужской' : 'Женский'} аватар ${index % 6 + 1}`, gender: index < 6 ? 'male' as const : 'female' as const,
}));
