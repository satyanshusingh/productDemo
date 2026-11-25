import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import EntityFormDialog from './EntityFormDialog.jsx';

export default function CrudPage({
  title,
  description,
  resource,
  rows,
  fields,
  columns,
  idField,
  canManage,
  onSave,
  onDelete,
}) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const isCreating = editing === 'new';
  const record = isCreating ? null : editing;

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => columns.some(column => {
      const value = column.render
        ? `${row[column.key] ?? ''}`
        : `${row[column.key] ?? ''}`;
      return value.toLowerCase().includes(query);
    }));
  }, [columns, rows, search]);

  const submit = async values => {
    await onSave(resource, record?.[idField], values);
    setEditing(null);
  };

  const remove = async row => {
    if (!window.confirm(`Delete this ${title.toLowerCase().replace(/s$/, '')}?`)) return;
    await onDelete(resource, row[idField]);
  };

  const emptyOptions = fields.some(field =>
    field.type === 'select' && field.required && field.options?.length === 0
  );

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">HELPDESK MANAGEMENT</p>
          <h1>{title}</h1>
          <p className="page-description">{description}</p>
        </div>
        {canManage && (
          <button
            type="button"
            className="button-primary create-button"
            onClick={() => setEditing('new')}
            disabled={emptyOptions}
            title={emptyOptions ? 'Add the required related records first.' : undefined}
          >
            <span>+</span> Add {title.slice(0, -1).toLowerCase()}
          </button>
        )}
      </section>

      <section className="content-card">
        <div className="table-toolbar">
          <div>
            <h2>All {title.toLowerCase()}</h2>
            <p>{rows.length} {rows.length === 1 ? 'record' : 'records'}</p>
          </div>
          <label className="search-box">
            <span className="search-icon">⌕</span>
            <input
              type="search"
              placeholder={`Search ${title.toLowerCase()}`}
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={visibleRows}
          idField={idField}
          canManage={canManage}
          onEdit={setEditing}
          onDelete={remove}
        />
      </section>

      {editing && (
        <EntityFormDialog
          title={`${isCreating ? 'Add' : 'Edit'} ${title.slice(0, -1).toLowerCase()}`}
          fields={fields}
          record={record}
          onClose={() => setEditing(null)}
          onSubmit={submit}
        />
      )}
    </>
  );
}
