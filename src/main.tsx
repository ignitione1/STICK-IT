import React from 'react';
import ReactDOM from 'react-dom/client';
import Workspace from './Workspace';
import './styles.css';
import './paper.css';
import './accounts.css';
import './profile.css';
import './archive.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Workspace /></React.StrictMode>,
);
