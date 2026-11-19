import {NOTE_CATEGORY_LIST, NOTE_CATEGORY_META} from '../constants';
import {FamilyEvent, NoteCategory, PersonalNote} from '../types';
import {formatDateVN} from '../utils/lunarCalendar';

export type NoteFilter = 'all' | 'pinned' | NoteCategory;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PersonalNotesRenderOptions {
  notes: PersonalNote[];
  allNotesCount: number;
  events: FamilyEvent[];
  activeFilter: NoteFilter;
  searchText: string;
  editingNote: PersonalNote | null;
  confirmDeleteNoteId: string | null;
  formError: string;
}

/**
 * Renders the 2D Personal Notes tab with a clean side-by-side composer and searchable
 * list of notes (with pinning, category filtering, and optional links to family events).
 */
export function renderPersonalNotesSection(opts: PersonalNotesRenderOptions): string {
  const {
    notes,
    allNotesCount,
    events,
    activeFilter,
    searchText,
    editingNote,
    confirmDeleteNoteId,
    formError,
  } = opts;

  const eventMap = new Map(events.map((e) => [e.id, e]));

  return `
    <section class="notes-layout-grid" aria-label="Ghi chú cá nhân">
      <div class="notes-composer-card">
        <div class="notes-composer-header">
          <div>
            <h2 class="list-heading">${editingNote ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú cá nhân'}</h2>
            <p class="fund-chart-subtitle">
              Lưu lại danh sách mua sắm, việc chuẩn bị giỗ chạp hoặc ghi nhớ riêng của bạn.
            </p>
          </div>
          ${
            editingNote
              ? `<button type="button" class="mini-btn" data-action="cancel-edit-note">Tạo mới</button>`
              : ''
          }
        </div>

        <form id="personal-note-form" class="notes-form">
          <input type="hidden" name="noteId" value="${escapeHtml(editingNote?.id ?? '')}" />

          <label class="form-field">
            <span>Tiêu đề ghi chú *</span>
            <input
              id="note-title-input"
              name="title"
              type="text"
              required
              value="${escapeHtml(editingNote?.title ?? '')}"
              placeholder="VD: Đồ cần mua cho ngày giỗ, Việc riêng cần nhớ..."
            />
          </label>

          <div class="form-grid-2">
            <label class="form-field">
              <span>Phân loại</span>
              <select name="category">
                ${NOTE_CATEGORY_LIST.map(
                  (cat) =>
                    `<option value="${cat}" ${(editingNote?.category ?? NoteCategory.PERSONAL) === cat ? 'selected' : ''}>${escapeHtml(NOTE_CATEGORY_META[cat].label)}</option>`,
                ).join('')}
              </select>
            </label>

            <label class="form-field">
              <span>Gắn với sự kiện (tuỳ chọn)</span>
              <select name="linkedEventId">
                <option value="">Không gắn sự kiện</option>
                ${events
                  .map(
                    (ev) =>
                      `<option value="${escapeHtml(ev.id)}" ${editingNote?.linkedEventId === ev.id ? 'selected' : ''}>${escapeHtml(ev.title)} (${escapeHtml(formatDateVN(ev.eventDate))})</option>`,
                  )
                  .join('')}
              </select>
            </label>
          </div>

          <label class="form-field">
            <span>Nội dung ghi chú *</span>
            <textarea
              id="note-content-input"
              name="content"
              rows="5"
              required
              placeholder="Nhập nội dung cần ghi nhớ, từng đầu việc có thể xuống dòng..."
            >${escapeHtml(editingNote?.content ?? '')}</textarea>
          </label>

          <label class="check-row">
            <input name="pinned" type="checkbox" ${editingNote?.pinned ? 'checked' : ''} />
            <span>Ghim ghi chú này lên đầu danh sách</span>
          </label>

          ${formError ? `<p class="qa-error">${escapeHtml(formError)}</p>` : ''}

          <div class="notes-form-footer">
            ${
              editingNote
                ? `<button type="button" class="btn-secondary" data-action="cancel-edit-note">Hủy</button>`
                : ''
            }
            <button type="submit" class="btn-primary">
              ${editingNote ? 'Lưu thay đổi' : 'Lưu ghi chú'}
            </button>
          </div>
        </form>
      </div>

      <div class="event-list-section">
        <div class="list-header">
          <div>
            <h2 class="list-heading">Ghi chú cá nhân</h2>
            <p class="fund-chart-subtitle">Chỉ lưu riêng trên thiết bị của bạn</p>
          </div>
          <span id="notes-list-count" class="list-count tabular-nums">${notes.length} / ${allNotesCount} ghi chú</span>
        </div>

        <div class="notes-toolbar">
          <div class="filter-tabs" role="tablist" aria-label="Lọc ghi chú cá nhân">
            <button type="button" class="filter-tab ${activeFilter === 'all' ? 'is-active' : ''}" data-action="set-note-filter" data-filter="all">Tất cả</button>
            <button type="button" class="filter-tab ${activeFilter === 'pinned' ? 'is-active' : ''}" data-action="set-note-filter" data-filter="pinned">Đã ghim</button>
            ${NOTE_CATEGORY_LIST.map(
              (cat) => `
              <button
                type="button"
                class="filter-tab ${activeFilter === cat ? 'is-active' : ''}"
                data-action="set-note-filter"
                data-filter="${cat}"
              >${escapeHtml(NOTE_CATEGORY_META[cat].shortLabel)}</button>
            `,
            ).join('')}
          </div>

          <input
            id="notes-search-input"
            type="search"
            class="search-input notes-search"
            value="${escapeHtml(searchText)}"
            placeholder="Tìm trong ghi chú..."
            aria-label="Tìm kiếm ghi chú cá nhân"
          />
        </div>

        <div id="personal-notes-list" class="notes-list">
          ${renderPersonalNoteRowsMarkup(notes, eventMap, confirmDeleteNoteId)}
        </div>
      </div>
    </section>
  `;
}

export function renderPersonalNoteRowsMarkup(
  notes: PersonalNote[],
  eventMap: Map<string, FamilyEvent>,
  confirmDeleteNoteId: string | null,
): string {
  if (notes.length === 0) {
    return `
      <div class="empty-state">
        <p class="empty-title">Chưa có ghi chú phù hợp</p>
        <p class="empty-desc">Nhập tiêu đề và nội dung ở khung bên cạnh để lưu ghi chú cá nhân đầu tiên.</p>
      </div>
    `;
  }

  return notes
    .map((note) => {
      const catMeta = NOTE_CATEGORY_META[note.category];
      const linkedEvent = note.linkedEventId ? eventMap.get(note.linkedEventId) : undefined;
      const isDeleting = confirmDeleteNoteId === note.id;

      return `
        <article class="note-row ${note.pinned ? 'is-pinned' : ''}">
          <div class="note-row-meta">
            ${note.pinned ? '<span class="note-pinned-label">Đã ghim</span><span class="sep" aria-hidden="true">·</span>' : ''}
            <span>${escapeHtml(catMeta.label)}</span>
            <span class="sep" aria-hidden="true">·</span>
            <span class="tabular-nums">Cập nhật ${escapeHtml(formatDateVN(note.updatedAt))}</span>
            ${
              linkedEvent
                ? `<span class="sep" aria-hidden="true">·</span>
                   <button type="button" class="note-event-link" data-action="open-detail" data-id="${escapeHtml(linkedEvent.id)}">Sự kiện: ${escapeHtml(linkedEvent.title)}</button>`
                : ''
            }
          </div>

          <h3 class="note-row-title">${escapeHtml(note.title)}</h3>
          <p class="note-row-content">${escapeHtml(note.content)}</p>

          <div class="note-row-actions">
            <button type="button" class="row-edit-link" data-action="toggle-pin-note" data-id="${escapeHtml(note.id)}">
              ${note.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
            </button>
            <span class="sep" aria-hidden="true">·</span>
            <button type="button" class="open-3d-link" data-action="edit-note" data-id="${escapeHtml(note.id)}">
              Chỉnh sửa
            </button>
            <span class="sep" aria-hidden="true">·</span>
            <button
              type="button"
              class="note-delete-link ${isDeleting ? 'is-confirming' : ''}"
              data-action="delete-note"
              data-id="${escapeHtml(note.id)}"
            >${isDeleting ? 'Nhấn lại để xác nhận xóa' : 'Xóa'}</button>
          </div>
        </article>
      `;
    })
    .join('');
}
