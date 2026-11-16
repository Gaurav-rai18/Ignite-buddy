import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export function Pager({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 15,
  pageSizeOptions = [10, 15, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
}) {
  const [jumpPage, setJumpPage] = useState('');

  if (totalItems === 0) return null;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with ellipses
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const handleJumpSubmit = (e) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPage, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setJumpPage('');
    }
  };

  return (
    <div className="pager-container" role="navigation" aria-label="Pagination Navigation">
      {/* Summary and Page Size */}
      <div className="pager-info-section">
        <span className="pager-text-summary">
          Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of{' '}
          <strong>{totalItems}</strong> {itemLabel}
        </span>

        {onPageSizeChange && (
          <div className="pager-size-control">
            <label htmlFor="pager-size-select">Per page:</label>
            <select
              id="pager-size-select"
              className="pager-size-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Nav Controls */}
      <div className="pager-nav-section">
        {/* First Page */}
        <button
          type="button"
          className="pager-btn"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          aria-label="First page"
          title="First page"
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          className="pager-btn"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        {/* Page numbers */}
        {getPageNumbers().map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`ellipsis-${idx}`} className="pager-ellipsis-span" aria-hidden="true">
                &hellip;
              </span>
            );
          }
          return (
            <button
              key={`page-${p}`}
              type="button"
              className={`pager-btn pager-num-btn ${currentPage === p ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
              aria-current={currentPage === p ? 'page' : undefined}
            >
              {p}
            </button>
          );
        })}

        {/* Next Page */}
        <button
          type="button"
          className="pager-btn"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          className="pager-btn"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Last page"
          title="Last page"
        >
          <ChevronsRight size={16} aria-hidden="true" />
        </button>

        {/* Jump-to Page */}
        {totalPages > 3 && (
          <form onSubmit={handleJumpSubmit} className="pager-jump-control">
            <label htmlFor="pager-jump-input">Go:</label>
            <input
              id="pager-jump-input"
              type="number"
              min={1}
              max={totalPages}
              className="pager-jump-input"
              placeholder={String(currentPage)}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
            />
          </form>
        )}
      </div>
    </div>
  );
}

