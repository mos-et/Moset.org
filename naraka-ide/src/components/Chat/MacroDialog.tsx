import React, { useState, useEffect } from 'react';
import { MacroItem } from '../../hooks/useMacros';
import '../../styles/components/MacroDialog.css';

interface MacroDialogProps {
  macros: MacroItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (macro: MacroItem) => void;
}

export function MacroDialog({ macros, isOpen, onClose, onSelect }: MacroDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Cierra modal con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = macros.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="macro-dialog-overlay" onClick={onClose}>
      <div className="macro-dialog-content" onClick={e => e.stopPropagation()}>
        <div className="macro-dialog-header">
          <h3>Seleccionar Macro</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="macro-dialog-search">
          <input
            type="text"
            placeholder="Buscar macro..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>
        <div className="macro-dialog-list">
          {filtered.length === 0 ? (
            <div className="macro-empty">No se encontraron macros</div>
          ) : (
            filtered.map(m => (
              <div key={m.id} className="macro-item" onClick={() => onSelect(m)}>
                <span className="macro-name">{m.name}</span>
                <span className="macro-id">{m.id}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export interface MacroVariablesDialogProps {
  isOpen: boolean;
  macroName: string;
  variables: string[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

export function MacroVariablesDialog({ isOpen, macroName, variables, onClose, onSubmit }: MacroVariablesDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      variables.forEach(v => initial[v] = '');
      setValues(initial);
    }
  }, [isOpen, variables]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <div className="macro-dialog-overlay" onClick={onClose}>
      <div className="macro-dialog-content" onClick={e => e.stopPropagation()}>
        <div className="macro-dialog-header">
          <h3>Completar Macro: {macroName}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="macro-variables-form">
          {variables.map(v => (
            <div key={v} className="macro-variable-row">
              <label>${v}</label>
              <input
                type="text"
                value={values[v] || ''}
                onChange={e => setValues(prev => ({ ...prev, [v]: e.target.value }))}
                required
                autoFocus={variables[0] === v}
              />
            </div>
          ))}
          <div className="macro-dialog-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary">Insertar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
