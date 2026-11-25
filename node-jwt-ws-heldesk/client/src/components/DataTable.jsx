import { useEffect, useMemo, useState } from 'react';

export default function DataTable({ columns, rows, idField, onEdit, onDelete, canManage }) {
  const [sortKey, setSortKey] = useState(columns[0]?.key);
  const [sortDirection, setSortDirection] = useState(1);
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const sortedRows = useMemo(() => [...rows].sort((first, second) => {
    const a = first[sortKey] ?? '';
    const b = second[sortKey] ?? '';
    const comparison = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : `${a}`.localeCompare(`${b}`, undefined, { numeric: true, sensitivity: 'base' });
    return comparison * sortDirection;
  }), [rows, sortDirection, sortKey]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => setPage(0), [rows]);

  const toggleSort = key => {
    if (sortKey === key) setSortDirection(direction => -direction);
    else {
      setSortKey(key);
      setSortDirection(1);
    }
  };

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key}>
                <button className="sort-button" onClick={() => toggleSort(column.key)}>
                  {column.label}{sortKey === column.key ? (sortDirection > 0 ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
            {canManage && <th className="actions-heading">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {pageRows.length ? pageRows.map(row => (
            <tr key={row[idField]}>
              {columns.map(column => {
                const value = row[column.key];
                return (
                  <td key={column.key}>
                    {column.render
                      ? column.render(value, row)
                      : value || column.empty || '—'}
                  </td>
                );
              })}
              {canManage && (
                <td className="row-actions">
                  <button type="button" className="icon-action" onClick={() => onEdit(row)} aria-label="Edit record">
                    Edit
                  </button>
                  <button type="button" className="icon-action danger-action" onClick={() => onDelete(row)} aria-label="Delete record">
                    Delete
                  </button>
                </td>
              )}
            </tr>
          )) : (
            <tr>
              <td className="empty-table" colSpan={columns.length + (canManage ? 1 : 0)}>
                No records yet. {canManage ? 'Create one to get started.' : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {sortedRows.length > pageSize && (
        <div className="pagination">
          <span>Page {page + 1} of {pageCount}</span>
          <div>
            <button type="button" className="button-secondary" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}>Previous</button>
            <button type="button" className="button-secondary" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
