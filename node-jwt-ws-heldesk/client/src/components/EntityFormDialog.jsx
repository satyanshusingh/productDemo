import { useState } from 'react';

function initialValues(fields, record) {
  return Object.fromEntries(fields.map(field => {
    const value = record?.[field.name];
    if (field.type === 'checkbox') {
      return [field.name, record ? Boolean(value) : Boolean(field.defaultValue)];
    }
    return [field.name, value ?? field.defaultValue ?? ''];
  }));
}

export default function EntityFormDialog({
  title,
  fields,
  record,
  onClose,
  onSubmit,
}) {
  const [values, setValues] = useState(() => initialValues(fields, record));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const update = event => {
    const { name, type, value, checked } = event.target;
    setValues(current => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const submit = async event => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (submitError) {
      setError(submitError.message || 'Could not save this record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{record ? 'UPDATE RECORD' : 'NEW RECORD'}</p>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} disabled={saving} aria-label="Close dialog">
            ×
          </button>
        </div>
        <form className="entity-form" onSubmit={submit}>
          {fields.map(field => {
            const required = field.requiredWhen
              ? field.requiredWhen(values, record)
              : record
                ? field.requiredOnEdit ?? field.required
                : field.requiredOnCreate ?? field.required;
            return (
              <label
                className={`field ${field.type === 'checkbox' ? 'checkbox-field' : ''}`}
                htmlFor={`field-${field.name}`}
                key={field.name}
              >
                {field.type === 'checkbox' ? (
                  <>
                    <input
                      id={`field-${field.name}`}
                      name={field.name}
                      type="checkbox"
                      checked={Boolean(values[field.name])}
                      onChange={update}
                    />
                    <span>{field.label}</span>
                  </>
                ) : (
                  <>
                    <span>{field.label}{required && <b aria-hidden="true"> *</b>}</span>
                    {field.type === 'select' ? (
                      <select
                        id={`field-${field.name}`}
                        name={field.name}
                        value={values[field.name]}
                        onChange={update}
                        required={required}
                        disabled={!field.options.length}
                      >
                        <option value="">{field.placeholder || 'Select an option'}</option>
                        {field.options.map(option => (
                          <option value={option.value} key={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={`field-${field.name}`}
                        name={field.name}
                        value={values[field.name]}
                        onChange={update}
                        maxLength={field.maxLength}
                        rows={field.rows || 3}
                        required={required}
                      />
                    ) : (
                      <input
                        id={`field-${field.name}`}
                        name={field.name}
                        type={field.type || 'text'}
                        value={values[field.name]}
                        onChange={update}
                        maxLength={field.maxLength}
                        minLength={field.minLength}
                        autoComplete={field.type === 'password' ? 'new-password' : undefined}
                        required={required}
                      />
                    )}
                  </>
                )}
                {field.hint && <small className="field-hint">{field.hint}</small>}
              </label>
            );
          })}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Saving…' : record ? 'Save changes' : 'Create record'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
