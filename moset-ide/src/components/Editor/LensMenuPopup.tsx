import React from "react";
import { IdeConfigState } from "../../hooks/useIdeConfig";
import LENS_DICTIONARIES from "../../languages/lensDictionaries.json";

// Generar lista de idiomas dinámicamente desde el JSON
const LANGUAGE_META: Record<string, { label: string; icon: string }> = {
  en: { label: "English", icon: "🇺🇸" },
  pt: { label: "Português", icon: "🇧🇷" },
  zh: { label: "中文 (Simplified)", icon: "🇨🇳" },
  ja: { label: "日本語", icon: "🇯🇵" },
  ko: { label: "한국어", icon: "🇰🇷" },
  ar: { label: "العربية", icon: "🇸🇦" },
};

interface LensMenuPopupProps {
  ideConfig: IdeConfigState;
  onClose: () => void;
}

export function LensMenuPopup({ ideConfig, onClose }: LensMenuPopupProps) {
  const availableLanguages = Object.keys(LENS_DICTIONARIES);
  
  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'default' }} 
        onClick={onClose} 
      />
      <div 
        className="lens-popup-menu"
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          backgroundColor: 'rgba(20, 20, 20, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--moset-sol)',
          borderRadius: '8px',
          padding: '8px',
          zIndex: 1000,
          width: '180px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ color: 'var(--moset-sol)', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '8px', padding: '0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Proyectar Lente en:
        </div>
        
        {/* Opción: Sin Lente */}
        <button
          onClick={() => {
            ideConfig.setUseLocalizationLens(false);
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            padding: '8px 12px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: !ideConfig.useLocalizationLens ? 'rgba(255, 184, 0, 0.15)' : 'transparent',
            color: !ideConfig.useLocalizationLens ? 'var(--moset-sol)' : '#ccc',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '0.85rem',
            transition: 'all 0.2s'
          }}
          className="menu-item-hover"
        >
          <span style={{ marginRight: '8px' }}>🚫</span>
          Sin Lente (Original)
        </button>

        {/* Idiomas disponibles desde JSON */}
        {availableLanguages.map(langId => {
          const meta = LANGUAGE_META[langId] || { label: langId, icon: '🌐' };
          const isActive = ideConfig.useLocalizationLens && ideConfig.lensLanguage === langId;
          
          return (
            <button
              key={langId}
              onClick={() => {
                ideConfig.setLensLanguage(langId);
                ideConfig.setUseLocalizationLens(true);
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: isActive ? 'rgba(255, 184, 0, 0.15)' : 'transparent',
                color: isActive ? 'var(--moset-sol)' : '#ccc',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
              className="menu-item-hover"
            >
              <span style={{ marginRight: '8px' }}>{meta.icon}</span>
              {meta.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
