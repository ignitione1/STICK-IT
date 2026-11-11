import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Check, Upload, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { Account, Catalog } from '../api';
import { presets } from '../data';
import type { FasteningId, PresetId } from '../types';
import PaperSurface from './PaperSurface';
import Fastening from './Fastening';
import { getPaperAppearance } from '../paper';
import { prepareAvatarPhoto } from '../photo';

export default function Profile({ account, catalog, onClose, onSaved }: {
  account: Account; catalog: Catalog; onClose: () => void; onSaved: (account: Account) => Promise<void>;
}) {
  const initialAvatar = catalog.avatars.find(avatar => avatar.url === account.avatarUrl);
  const [avatarId, setAvatarId] = useState<string | undefined>(initialAvatar?.id);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [gender, setGender] = useState<'male' | 'female'>(initialAvatar?.gender ?? 'male');
  const [styleId, setStyleId] = useState<PresetId>(account.paperStyle);
  const [fastening, setFastening] = useState<FasteningId>(account.fastening);
  const [busy, setBusy] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const paper = getPaperAppearance(100);
  const avatarUrl = photo ?? catalog.avatars.find(avatar => avatar.id === avatarId)?.url ?? account.avatarUrl;
  const previewStyle = (id: PresetId) => ({ '--paper-color': presets[id].color, '--rotation': '-2deg',
    '--sheet-edge': paper.edge, '--wear-corner-size': paper.cornerSize, '--texture-position': paper.texturePosition,
    '--texture-size': paper.textureSize } as CSSProperties);
  const changed = () => { setMessage(''); setError(''); };
  return <main className="account-page profile-page"><div className="account-page-inner">
    <button className="account-back" onClick={onClose}><ArrowLeft size={17} />К доске</button>
    <header className="account-page-header"><div><span className="account-eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</span><h1>Ваш почерк</h1><p>Знакомое лицо. Любимая бумага. Маленькие детали.</p></div><div className="account-identity"><strong>{account.displayName}</strong><span>@{account.login}</span></div></header>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try {
      const result = await api<{ employee: Account }>('/profile', 'PATCH', { avatarId, avatarPhoto: photo, paperStyle: styleId, fastening });
      await onSaved(result.employee); setPhoto(undefined); setMessage('Профиль сохранён. Бумага и крепление применятся к новым стикерам.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить'); } finally { setBusy(false); } }}>
      <fieldset className="profile-fields" disabled={busy || readingPhoto}>
        <div className="profile-layout"><div className="profile-settings">
          <section className="account-section"><div className="profile-section-heading"><div><span className="profile-step">01 / ЛИЦО</span><h2>Как вас узнают</h2></div><span className="profile-detail">12 образов + ваше фото</span></div>
            <div className="profile-avatar-row"><div className="profile-current-avatar">{avatarUrl ? <img src={avatarUrl} alt="Ваш аватар" /> : <span>{account.displayName.slice(0, 1)}</span>}</div><div className="photo-upload"><label className="photo-upload-button"><Upload size={16} />{readingPhoto ? 'Готовим фото…' : 'Загрузить своё фото'}<input type="file" aria-label="Своё фото" accept="image/jpeg,image/png,image/webp" onChange={async event => {
              const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
              changed(); setReadingPhoto(true);
              try { const image = await prepareAvatarPhoto(file); setPhoto(image); setAvatarId(undefined); }
              catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось загрузить фото'); }
              finally { setReadingPhoto(false); }
            }} /></label><small>JPG, PNG или WebP до 10 МБ.<br />Обрежем по центру и уберём лишний размер.</small></div></div>
            <div className="avatar-gender" role="group" aria-label="Образы аватара">{(['male', 'female'] as const).map(value => <button type="button" key={value} aria-label={value === 'male' ? 'Мужчина' : 'Женщина'} title={value === 'male' ? 'Мужчина' : 'Женщина'} aria-pressed={gender === value} onClick={() => setGender(value)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx={value === 'male' ? 9 : 12} cy={value === 'male' ? 15 : 8} r="5" /><path d={value === 'male' ? 'M13 11l7-7m-6 0h6v6' : 'M12 13v9m-4-4h8'} /></svg></button>)}</div>
            <div className="avatar-choices" role="group" aria-label="Аватар">{catalog.avatars.filter(avatar => avatar.gender === gender).map(avatar => <button type="button" key={avatar.id} className={`avatar-choice ${avatarId === avatar.id ? 'chosen' : ''}`} aria-label={avatar.name} aria-pressed={avatarId === avatar.id} onClick={() => { changed(); setAvatarId(avatar.id); setPhoto(undefined); }}><img src={avatar.url} alt="" />{avatarId === avatar.id && <Check size={14} />}</button>)}</div>
          </section>
          <section className="account-section"><div className="profile-section-heading"><div><span className="profile-step">02 / БУМАГА</span><h2>Маленькая коллекция</h2></div><span className="profile-detail">10 дизайнов</span></div>
            <div className="style-choices" role="group" aria-label="Стиль стикера">{catalog.styles.map(style => <button type="button" key={style.id} className={`style-choice ${styleId === style.id ? 'chosen' : ''}`} aria-label={style.name} title={style.name} aria-pressed={styleId === style.id} onClick={() => { changed(); setStyleId(style.id); }}>
              <div className={`sticky-note style-preview preset-${style.id} paper-wear-${paper.variant} paper-corner-${paper.cornerSide}`} aria-hidden="true" style={previewStyle(style.id)}><PaperSurface preset={style.id} /><div className="note-html"><span className="sample-handwriting">Есть идея.</span><small>ДАВАЙТЕ ОБСУДИМ</small></div></div>
              {styleId === style.id && <Check className="style-check" size={16} aria-hidden="true" />}
            </button>)}</div>
          </section>
          <section className="account-section"><div className="profile-section-heading"><div><span className="profile-step">03 / ДЕТАЛЬ</span><h2>Чем закрепим?</h2></div></div><div className="fastening-choices" role="group" aria-label="Крепление стикера">{catalog.fastenings.map(item => <button type="button" key={item.id} className={`fastening-choice ${fastening === item.id ? 'chosen' : ''}`} aria-label={item.name} title={item.name} aria-pressed={fastening === item.id} onClick={() => { changed(); setFastening(item.id); }}><span className="fastening-sample" aria-hidden="true"><Fastening kind={item.id} hue={44} layer="whole" /></span>{fastening === item.id && <Check className="fastening-check" size={15} aria-hidden="true" />}</button>)}</div></section>
        </div><aside className="profile-preview"><span className="account-eyebrow"><Sparkles size={13} />ТАК ВАС УВИДЯТ КОЛЛЕГИ</span><div className="profile-preview-board"><div className={`sticky-note profile-live-note preset-${styleId} paper-wear-${paper.variant} paper-corner-${paper.cornerSide}`} style={previewStyle(styleId)}><PaperSurface preset={styleId} fastening={fastening} /><Fastening kind={fastening} hue={44} /><div className="note-html"><div className="profile-preview-author">{avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{account.displayName.slice(0, 1)}</span>}<div><strong>{account.displayName}</strong><small>Только что</small></div></div><p className="sample-handwriting">Есть идея.<br />Давайте создадим<br />что-нибудь хорошее!</p><div className="profile-preview-footer">ВАШ МАЛЕНЬКИЙ ПОЧЕРК</div></div></div></div><p>Бумага и крепление — для новых записок.<br />У уже отправленных останется их оформление.</p></aside></div>
      </fieldset>
      <footer className="account-save"><div><p>Имя, логин, пароль и отделы меняет администратор.</p>{message && <p role="status" className="account-success">{message}</p>}{error && <p role="alert" className="account-error">{error}</p>}</div><button className="primary-button" disabled={busy || readingPhoto}>{busy ? 'Сохраняем…' : 'Сохранить профиль'}</button></footer>
    </form>
  </div></main>;
}
