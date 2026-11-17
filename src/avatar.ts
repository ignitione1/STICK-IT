const legacyAvatars: Record<string, string> = {
  '/assets/anna.jpg': '/assets/avatars/avatar-7.svg',
  '/assets/denis.jpg': '/assets/avatars/avatar-1.svg',
  '/assets/elena.jpg': '/assets/avatars/avatar-8.svg',
  '/assets/maxim.jpg': '/assets/avatars/avatar-2.svg',
  '/assets/olga.jpg': '/assets/avatars/avatar-9.svg',
  '/assets/maria.jpg': '/assets/avatars/avatar-10.svg',
  '/assets/victor.jpg': '/assets/avatars/avatar-3.svg',
  '/assets/konstantin.jpg': '/assets/avatars/avatar-4.svg',
};

export function resolveAvatar(url: string | null): string | null {
  return url ? legacyAvatars[url] ?? url : null;
}
