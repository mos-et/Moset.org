import { useState, useEffect } from 'react';
import './LanguageModal.css';

export default function LanguageModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedLang, setSelectedLang] = useState('es');

  useEffect(() => {
    const lang = localStorage.getItem('moset_native_lang');
    if (!lang) {
      setIsVisible(true);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('moset_native_lang', selectedLang);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const languages = [
    { code: 'es', name: 'Español (Moset)' },
    { code: 'en', name: 'English (Moset EN)' },
    { code: 'jp', name: '日本語 (Nihongo)' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'zh', name: '中文 (Zhongwen)' }
  ];

  return (
    <div className="lang-modal-overlay">
      <div className="lang-modal-glass">
        <div className="lang-modal-header">
          <div className="lang-modal-logo-glow" />
          <img src="/moset-logo.png" alt="Moset" className="lang-modal-logo" />
        </div>
        <h2>Bienvenido a Moset</h2>
        <p>El primer lenguaje de programación y entorno verdaderamente <strong>soberano y políglota</strong>.</p>
        <p className="lang-modal-sub">Selecciona el idioma natal con el que programarás. El motor adaptará todas las palabras clave y estructuras de control a tu idioma elegido localmente.</p>
        
        <div className="lang-selector-grid">
          {languages.map(l => (
            <button 
              key={l.code} 
              className={`lang-btn ${selectedLang === l.code ? 'active' : ''}`}
              onClick={() => setSelectedLang(l.code)}
            >
              {l.name}
            </button>
          ))}
        </div>

        <button className="lang-save-btn" onClick={handleSave}>
          Comenzar en {languages.find(l => l.code === selectedLang)?.name}
        </button>
      </div>
    </div>
  );
}
