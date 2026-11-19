import {EVENT_TYPE_META, MONTH_NAMES_VI} from '../constants';
import {FamilyEvent} from '../types';
import {
  formatDateVN,
  formatLunarShort,
  formatVND,
  getLunarFromISO,
  getTodayISO,
} from '../utils/lunarCalendar';

const WEEKDAYS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders the 2D interactive Solar + Lunar monthly calendar view so users can
 * visually inspect dates and click any day to add or view family events.
 */
export function renderCalendarMonthSection(
  year: number,
  month: number,
  allFamilyEvents: FamilyEvent[],
): string {
  const today = getTodayISO();
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const eventsByDate = new Map<string, FamilyEvent[]>();
  const monthEvents: FamilyEvent[] = [];
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;

  for (const ev of allFamilyEvents) {
    if (ev.eventDate.startsWith(monthPrefix)) {
      monthEvents.push(ev);
      const list = eventsByDate.get(ev.eventDate) ?? [];
      list.push(ev);
      eventsByDate.set(ev.eventDate, list);
    }
  }
  monthEvents.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const cells: string[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push('<div class="cal-cell is-outside" aria-hidden="true"></div>');
      continue;
    }

    const iso = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const lunar = getLunarFromISO(iso);
    const lunarLabel = lunar
      ? lunar.day === 1 || dayNum === 1
        ? `${lunar.day}/${lunar.month} ÂL`
        : `${lunar.day}`
      : '';
    const isToday = iso === today;
    const dayEvents = eventsByDate.get(iso) ?? [];

    cells.push(`
      <div class="cal-cell ${isToday ? 'is-today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}">
        <div class="cal-cell-top">
          <span class="cal-solar-num tabular-nums">${dayNum}</span>
          <span class="cal-lunar-num tabular-nums">${escapeHtml(lunarLabel)}</span>
          <button
            type="button"
            class="cal-add-day-btn"
            data-action="open-add-date"
            data-date="${iso}"
            title="Thêm sự kiện ngày ${formatDateVN(iso)}"
            aria-label="Thêm sự kiện ngày ${formatDateVN(iso)}"
          >+</button>
        </div>
        <div class="cal-cell-events">
          ${dayEvents
            .slice(0, 3)
            .map(
              (ev) => `
            <button
              type="button"
              class="cal-event-item"
              data-action="open-detail"
              data-id="${escapeHtml(ev.id)}"
              title="${escapeHtml(ev.title)}"
            >${escapeHtml(ev.title)}</button>
          `,
            )
            .join('')}
          ${
            dayEvents.length > 3
              ? `<span class="cal-more-label">+${dayEvents.length - 3} sự kiện</span>`
              : ''
          }
        </div>
      </div>
    `);
  }

  return `
    <section class="calendar-section" aria-label="Lịch Âm Dương theo tháng">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button type="button" class="btn-secondary cal-nav-btn" data-action="cal-prev">‹ Tháng trước</button>
          <h2 class="calendar-month-title tabular-nums">${MONTH_NAMES_VI[month - 1]} / ${year}</h2>
          <button type="button" class="btn-secondary cal-nav-btn" data-action="cal-next">Tháng sau ›</button>
        </div>
        <div class="calendar-header-right">
          <button type="button" class="btn-secondary cal-nav-btn" data-action="cal-today">Hôm nay</button>
          <span class="list-count tabular-nums">${monthEvents.length} sự kiện trong tháng</span>
        </div>
      </div>

      <div class="cal-weekdays">
        ${WEEKDAYS_VI.map((d) => `<div class="cal-weekday">${d}</div>`).join('')}
      </div>

      <div class="cal-grid">
        ${cells.join('')}
      </div>
    </section>

    <section class="event-list-section" aria-label="Sự kiện trong tháng">
      <div class="list-header">
        <h3 class="list-heading">Sự kiện trong ${MONTH_NAMES_VI[month - 1]} / ${year}</h3>
        <button type="button" class="btn-secondary" data-action="open-add-date" data-date="${year}-${String(month).padStart(2, '0')}-15">+ Thêm vào tháng này</button>
      </div>
      ${
        monthEvents.length === 0
          ? `
        <div class="empty-state">
          <p class="empty-title">Chưa có sự kiện nào trong ${MONTH_NAMES_VI[month - 1]} / ${year}</p>
          <p class="empty-desc">Nhấn dấu "+" trên bất kỳ ngày nào trong lịch ở trên để thêm ngày giỗ hoặc sự kiện mới.</p>
        </div>
      `
          : `
        <div class="month-compact-list">
          ${monthEvents
            .map(
              (ev) => `
            <div class="month-compact-row">
              <div class="month-compact-date tabular-nums">
                <strong>${escapeHtml(formatDateVN(ev.eventDate))}</strong>
                <span>${escapeHtml(formatLunarShort(ev.eventDate))}</span>
              </div>
              <div class="month-compact-info">
                <div class="event-title">${escapeHtml(ev.title)}</div>
                <div class="event-meta-line">
                  <span>${escapeHtml(EVENT_TYPE_META[ev.eventType].label)}</span>
                  ${ev.location ? `<span class="sep">·</span><span>${escapeHtml(ev.location)}</span>` : ''}
                  ${
                    ev.expectedAmount > 0
                      ? `<span class="sep">·</span><span class="tabular-nums">Dự kiến ${escapeHtml(formatVND(ev.expectedAmount))}</span>`
                      : ''
                  }
                </div>
              </div>
              <button type="button" class="btn-secondary" data-action="open-detail" data-id="${escapeHtml(ev.id)}">Chi tiết</button>
            </div>
          `,
            )
            .join('')}
        </div>
      `
      }
    </section>
  `;
}
