import {EVENT_TYPE_META} from '../constants';
import {
  AttendanceStatus,
  FamilyEvent,
  FamilyGroup,
  FinancialSummary,
  FundTransaction,
  FundTransactionType,
  PaymentSource,
} from '../types';
import {formatDateVN, formatVND, getTodayISO} from '../utils/lunarCalendar';
import {getFundBreakdownStats} from './FundRatioChart';

export type FundTxnFilter = 'all' | 'in' | 'out';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FUND_TYPE_LABEL: Record<FundTransactionType, string> = {
  [FundTransactionType.INITIAL]: 'Quỹ đầu năm',
  [FundTransactionType.CONTRIBUTION]: 'Thu đóng góp',
  [FundTransactionType.EXPENSE]: 'Chi từ quỹ',
};

const QUICK_FUND_AMOUNTS = [
  {label: '500k', value: 500_000},
  {label: '1 triệu', value: 1_000_000},
  {label: '2 triệu', value: 2_000_000},
  {label: '5 triệu', value: 5_000_000},
];

export interface FinanceFundRenderOptions {
  family: FamilyGroup;
  year: number;
  summary: FinancialSummary;
  transactions: FundTransaction[];
  events: FamilyEvent[];
  fundError: string;
  txnFilter: FundTxnFilter;
  confirmDeleteTxnId: string | null;
}

/**
 * Renders the dedicated 2D "Tiền quỹ" tab focused on clan/family fund management:
 * top balance strip, D3 Thu/Chi pie chart, quick Thu/Chi entry form, filterable fund
 * transaction ledger, annual budget controls, and per-event expense breakdown.
 */
export function renderFinanceFundSection(opts: FinanceFundRenderOptions): string {
  const {
    family,
    year,
    summary,
    transactions,
    events,
    fundError,
    txnFilter,
    confirmDeleteTxnId,
  } = opts;

  const fundStats = getFundBreakdownStats(summary, transactions);
  const budgetPct =
    summary.annualBudget > 0
      ? Math.min(100, Math.round((summary.totalActualAll / summary.annualBudget) * 100))
      : 0;
  const isOverBudget = summary.remainingBudget < 0;
  const today = getTodayISO();
  const defaultActor = family.members[0]?.fullName ?? 'Chủ hộ';

  const filteredTransactions = transactions.filter((t) => {
    if (txnFilter === 'in') return t.type !== FundTransactionType.EXPENSE;
    if (txnFilter === 'out') return t.type === FundTransactionType.EXPENSE;
    return true;
  });

  const activeEvents = events.filter((e) => e.attendance !== AttendanceStatus.NOT_ATTENDING);

  return `
    <section class="fund-hero-bar" aria-label="Tổng quan tiền quỹ">
      <div class="fund-hero-title-block">
        <h1 class="hero-title">Tiền quỹ · ${escapeHtml(family.name)}</h1>
        <p class="hero-subtitle">
          Quản lý thu đóng góp, chi tiêu quỹ dòng họ và đối chiếu tiền đám năm ${year}.
        </p>
      </div>
      <div class="fund-kpi-bar">
        <div class="kpi-item">
          <div class="kpi-label">Số dư Tiền quỹ</div>
          <div class="kpi-value tabular-nums ${summary.fundBalance < 0 ? 'text-danger' : 'text-success'}">
            ${escapeHtml(formatVND(summary.fundBalance))}${summary.fundBalance < 0 ? ' (Âm quỹ)' : ''}
          </div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">Tổng thu quỹ (${fundStats.inPctLabel})</div>
          <div class="kpi-value tabular-nums text-success">${escapeHtml(formatVND(summary.fundTotalIn))}</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">Tổng chi quỹ (${fundStats.outPctLabel})</div>
          <div class="kpi-value tabular-nums text-danger">${escapeHtml(formatVND(summary.fundTotalOut))}</div>
        </div>
      </div>
    </section>

    <section class="finance-top-grid">
      <div class="fund-chart-panel" aria-label="Biểu đồ tỷ lệ thu chi tiền quỹ">
        <div class="fund-chart-header">
          <div>
            <h2 class="fund-chart-title">Tỷ lệ Thu / Chi Tiền quỹ</h2>
            <p class="fund-chart-subtitle tabular-nums">
              ${transactions.length} giao dịch · Năm ${year}
            </p>
          </div>
        </div>

        <div class="fund-chart-body">
          <div id="finance-fund-ratio-chart" class="fund-pie-mount"></div>

          <div id="finance-fund-ratio-legend" class="fund-legend">
            <div class="fund-legend-row" data-fund-slice="in" tabindex="0">
              <div class="fund-legend-label-wrap">
                <span class="fund-swatch fund-swatch-in" aria-hidden="true"></span>
                <div class="fund-legend-text">
                  <span class="fund-legend-name">Tổng thu quỹ</span>
                  <span class="fund-legend-detail tabular-nums">
                    Đầu năm ${escapeHtml(formatVND(fundStats.initialTotal))} · Đóng góp ${escapeHtml(formatVND(fundStats.contributionTotal))}
                  </span>
                </div>
              </div>
              <div class="fund-legend-metrics tabular-nums">
                <span class="fund-legend-amount text-success">${escapeHtml(formatVND(summary.fundTotalIn))}</span>
                <span class="fund-legend-pct">${escapeHtml(fundStats.inPctLabel)}</span>
              </div>
            </div>

            <div class="fund-legend-row" data-fund-slice="out" tabindex="0">
              <div class="fund-legend-label-wrap">
                <span class="fund-swatch fund-swatch-out" aria-hidden="true"></span>
                <div class="fund-legend-text">
                  <span class="fund-legend-name">Tổng chi quỹ</span>
                  <span class="fund-legend-detail tabular-nums">${fundStats.expenseCount} khoản chi từ quỹ</span>
                </div>
              </div>
              <div class="fund-legend-metrics tabular-nums">
                <span class="fund-legend-amount text-danger">${escapeHtml(formatVND(summary.fundTotalOut))}</span>
                <span class="fund-legend-pct">${escapeHtml(fundStats.outPctLabel)}</span>
              </div>
            </div>

            <div class="fund-balance-row tabular-nums">
              <span class="fund-balance-label">Số dư hiện tại</span>
              <span class="fund-balance-value ${summary.fundBalance < 0 ? 'text-danger' : 'text-success'}">
                ${escapeHtml(formatVND(summary.fundBalance))}${summary.fundBalance < 0 ? ' (Âm quỹ)' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="budget-panel">
        <div class="fund-chart-header">
          <div>
            <h2 class="fund-chart-title">Ngân sách tiền đám năm ${year}</h2>
            <p class="fund-chart-subtitle tabular-nums">
              Đã xác nhận ${summary.confirmedExpenseCount} sự kiện · Dự kiến cả năm ${escapeHtml(formatVND(summary.totalExpected))}
            </p>
          </div>
        </div>

        <div class="budget-metrics tabular-nums">
          <div class="budget-metric-row">
            <span>Đã chi thực tế (Cá nhân + Quỹ)</span>
            <strong>${escapeHtml(formatVND(summary.totalActualAll))}</strong>
          </div>
          <div class="budget-metric-row is-sub">
            <span>Trong đó: Tiền cá nhân ${escapeHtml(formatVND(summary.totalActualPersonal))} · Từ quỹ chung ${escapeHtml(formatVND(summary.totalActualFromFund))}</span>
          </div>
          <div class="budget-bar-track" aria-label="Tiến độ sử dụng ngân sách">
            <div class="budget-bar-fill ${isOverBudget ? 'is-over' : ''}" style="width: ${budgetPct}%"></div>
          </div>
          <div class="budget-metric-row">
            <span>${isOverBudget ? 'Vượt ngân sách' : 'Ngân sách còn lại'}</span>
            <strong class="${isOverBudget ? 'text-danger' : 'text-success'}">${escapeHtml(formatVND(Math.abs(summary.remainingBudget)))}</strong>
          </div>
        </div>

        <form id="budget-update-form" class="budget-edit-form">
          <label class="form-field">
            <span>Điều chỉnh hạn mức ngân sách năm (VNĐ)</span>
            <div class="budget-input-row">
              <input
                name="annualBudget"
                type="text"
                value="${summary.annualBudget}"
                placeholder="VD: 20000000 hoặc 25tr"
              />
              <button type="submit" class="btn-secondary">Lưu ngân sách</button>
            </div>
          </label>
        </form>
      </div>
    </section>

    <section class="finance-entry-card" aria-label="Ghi nhận giao dịch tiền quỹ">
      <div class="list-header">
        <h3 class="list-heading">Ghi nhận khoản Thu / Chi Tiền quỹ</h3>
        <span class="list-count">Cập nhật số dư &amp; biểu đồ ngay lập tức</span>
      </div>
      <form id="finance-fund-form" class="finance-fund-form">
        <div class="form-grid-4">
          <label class="form-field">
            <span>Loại giao dịch</span>
            <select name="fundType">
              <option value="${FundTransactionType.CONTRIBUTION}">Thu đóng góp vào quỹ</option>
              <option value="${FundTransactionType.EXPENSE}">Chi từ tiền quỹ</option>
            </select>
          </label>

          <label class="form-field">
            <span>Số tiền (VNĐ) *</span>
            <input
              id="fin-fund-amount"
              name="fundAmount"
              type="text"
              required
              placeholder="VD: 1000000 hoặc 2tr"
            />
          </label>

          <label class="form-field">
            <span>Người đóng / người chi</span>
            <input name="actorName" type="text" value="${escapeHtml(defaultActor)}" placeholder="Họ tên thành viên" />
          </label>

          <label class="form-field">
            <span>Ngày giao dịch</span>
            <input name="transactionDate" type="date" value="${today}" />
          </label>
        </div>

        <div class="finance-fund-bottom">
          <div class="quick-btn-strip">
            <span class="quick-strip-label">Chọn nhanh:</span>
            ${QUICK_FUND_AMOUNTS.map(
              (q) =>
                `<button type="button" class="mini-btn" data-action="fill-fin-amount" data-amount="${q.value}">${q.label}</button>`,
            ).join('')}
          </div>

          <div class="finance-note-submit">
            <input
              name="fundNote"
              type="text"
              class="finance-note-input"
              placeholder="Ghi chú nội dung thu / chi (VD: Đóng góp quý 4, Mua lễ vật...)"
              aria-label="Nội dung giao dịch quỹ"
            />
            <button type="submit" class="btn-primary">Lưu giao dịch</button>
          </div>
        </div>
        ${fundError ? `<p class="qa-error">${escapeHtml(fundError)}</p>` : ''}
      </form>
    </section>

    <section class="finance-tables-grid">
      <div class="event-list-section">
        <div class="list-header fund-ledger-header">
          <div>
            <h3 class="list-heading">Sổ giao dịch Tiền quỹ</h3>
            <span class="list-count tabular-nums">${filteredTransactions.length} / ${transactions.length} giao dịch</span>
          </div>
          <div class="segmented-mini" role="tablist" aria-label="Lọc giao dịch tiền quỹ">
            <button type="button" class="seg-mini-btn ${txnFilter === 'all' ? 'is-active' : ''}" data-action="set-fund-filter" data-filter="all">Tất cả</button>
            <button type="button" class="seg-mini-btn ${txnFilter === 'in' ? 'is-active' : ''}" data-action="set-fund-filter" data-filter="in">Khoản thu</button>
            <button type="button" class="seg-mini-btn ${txnFilter === 'out' ? 'is-active' : ''}" data-action="set-fund-filter" data-filter="out">Khoản chi</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Loại &amp; Nội dung</th>
                <th>Người thực hiện</th>
                <th class="col-right">Số tiền</th>
                <th class="col-right">Xóa</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredTransactions.length === 0
                  ? `<tr><td colspan="5" class="table-empty">Chưa có giao dịch tiền quỹ phù hợp.</td></tr>`
                  : filteredTransactions
                      .map((t) => {
                        const isOut = t.type === FundTransactionType.EXPENSE;
                        const isConfirming = confirmDeleteTxnId === t.id;
                        return `
                      <tr>
                        <td class="tabular-nums nowrap">${escapeHtml(formatDateVN(t.transactionDate))}</td>
                        <td>
                          <div class="td-primary">${escapeHtml(FUND_TYPE_LABEL[t.type])}</div>
                          <div class="td-sub">${escapeHtml(t.note)}</div>
                        </td>
                        <td>${escapeHtml(t.actorName)}</td>
                        <td class="col-right tabular-nums nowrap ${isOut ? 'text-danger' : 'text-success'}">
                          <strong>${isOut ? '-' : '+'}${escapeHtml(formatVND(t.amount))}</strong>
                        </td>
                        <td class="col-right nowrap">
                          <button
                            type="button"
                            class="note-delete-link ${isConfirming ? 'is-confirming' : ''}"
                            data-action="delete-fund-txn"
                            data-id="${escapeHtml(t.id)}"
                          >${isConfirming ? 'Xác nhận' : 'Xóa'}</button>
                        </td>
                      </tr>
                    `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="event-list-section">
        <div class="list-header">
          <h3 class="list-heading">Tiền đám theo sự kiện</h3>
          <span class="list-count tabular-nums">${activeEvents.length} sự kiện</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Sự kiện</th>
                <th class="col-right">Dự kiến</th>
                <th class="col-right">Thực tế</th>
                <th class="col-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${
                activeEvents.length === 0
                  ? `<tr><td colspan="4" class="table-empty">Chưa có sự kiện nào có khoản chi.</td></tr>`
                  : activeEvents
                      .map(
                        (ev) => `
                    <tr>
                      <td>
                        <div class="td-primary">${escapeHtml(ev.title)}</div>
                        <div class="td-sub tabular-nums">
                          ${escapeHtml(formatDateVN(ev.eventDate))} · ${escapeHtml(EVENT_TYPE_META[ev.eventType].label)} · ${ev.paymentSource === PaymentSource.FAMILY_FUND ? 'Quỹ chung' : 'Cá nhân'}
                        </div>
                      </td>
                      <td class="col-right tabular-nums nowrap">${escapeHtml(formatVND(ev.expectedAmount))}</td>
                      <td class="col-right tabular-nums nowrap">
                        ${
                          ev.expenseConfirmed
                            ? `<strong class="text-success">${escapeHtml(formatVND(ev.actualAmount))}</strong>`
                            : '<span class="td-sub">Chưa xác nhận</span>'
                        }
                      </td>
                      <td class="col-right nowrap">
                        <button type="button" class="open-3d-link" data-action="open-detail" data-id="${escapeHtml(ev.id)}">
                          ${ev.expenseConfirmed ? 'Sửa tiền' : 'Xác nhận chi'}
                        </button>
                      </td>
                    </tr>
                  `,
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}
