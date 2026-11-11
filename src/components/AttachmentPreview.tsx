import { useState } from 'react';
import { Download } from 'lucide-react';
import type { NoteAttachment } from '../types';
import Modal from './Modal';

export default function AttachmentPreview({ file, onClose }: { file: NoteAttachment; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  return <Modal title="Изображение" className="image-preview-modal" onClose={onClose}>
    <div className="attachment-preview">
      {file.id && file.available !== false ? <>{failed ? <p role="alert">Не удалось загрузить изображение. Попробуйте открыть его заново.</p>
        : <img src={'/api/attachments/' + file.id + '/preview'} alt={file.name} onError={() => setFailed(true)} />}
        <strong>{file.name}</strong><span>{file.caption}</span>
        <a className="primary-button" href={'/api/attachments/' + file.id + '/download'} download={file.name}><Download size={16} />Скачать</a></>
        : <p>Файл из прежней демонстрационной записки недоступен. Прикрепите его к новой записке.</p>}
    </div>
  </Modal>;
}
