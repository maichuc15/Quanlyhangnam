import * as d3 from 'd3';
import {FinancialSummary, FundTransaction, FundTransactionType} from '../types';
import {formatVND} from '../utils/lunarCalendar';

export interface FundSliceDatum {
  key: 'in' | 'out';
  label: string;
  shortLabel: string;
  amount: number;
  percent: number;
  color: string;
  hoverColor: string;
}

function formatCompactVND(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toLocaleString('vi-VN', {maximumFractionDigits: 1})} tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('vi-VN', {maximumFractionDigits: 1})} tr`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000).toLocaleString('vi-VN')}k`;
  }
  return `${sign}${abs.toLocaleString('vi-VN')}đ`;
}

function formatPercentVN(value: number): string {
  return `${value.toLocaleString('vi-VN', {
    minimumFractionDigits: value === 0 || value === 100 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * Renders an interactive D3 pie/donut chart visualizing the current family/clan fund
 * Income (Thu) vs Expense (Chi) ratio, synced with legend hover and keyboard focus.
 */
export function renderFundRatioPieChart(
  container: HTMLElement,
  summary: FinancialSummary,
  transactions: FundTransaction[],
  legendRoot?: HTMLElement | null,
): void {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const totalIn = Math.max(0, summary.fundTotalIn);
  const totalOut = Math.max(0, summary.fundTotalOut);
  const totalFlow = totalIn + totalOut;

  const inPct = totalFlow > 0 ? (totalIn / totalFlow) * 100 : 0;
  const outPct = totalFlow > 0 ? (totalOut / totalFlow) * 100 : 0;

  const slices: FundSliceDatum[] = [
    {
      key: 'in',
      label: 'Tổng thu quỹ',
      shortLabel: 'Thu quỹ',
      amount: totalIn,
      percent: inPct,
      color: '#16A34A',
      hoverColor: '#15803D',
    },
    {
      key: 'out',
      label: 'Tổng chi quỹ',
      shortLabel: 'Chi quỹ',
      amount: totalOut,
      percent: outPct,
      color: '#DC2626',
      hoverColor: '#B91C1C',
    },
  ];

  const activeSlices = slices.filter((d) => d.amount > 0);
  const size = 180;
  const radius = size / 2 - 10;
  const innerRadius = radius * 0.62;

  const root = d3.select(container);
  root.selectAll('*').remove();

  const ariaSummary =
    totalFlow > 0
      ? `Biểu đồ hình tròn tỷ lệ thu chi quỹ: Thu ${formatVND(totalIn)} (${formatPercentVN(inPct)}), Chi ${formatVND(totalOut)} (${formatPercentVN(outPct)}), Số dư ${formatVND(summary.fundBalance)}`
      : 'Biểu đồ tỷ lệ thu chi quỹ chưa có giao dịch';

  const svg = root
    .append('svg')
    .attr('class', 'fund-pie-svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('width', size)
    .attr('height', size)
    .attr('role', 'img')
    .attr('aria-label', ariaSummary);

  const g = svg.append('g').attr('transform', `translate(${size / 2}, ${size / 2})`);

  const centerGroup = g.append('g').attr('class', 'fund-pie-center');
  const centerTop = centerGroup
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('y', -11)
    .attr('class', 'fund-pie-center-label');

  const centerValue = centerGroup
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('y', 11)
    .attr('class', 'fund-pie-center-value');

  const centerSub = centerGroup
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('y', 29)
    .attr('class', 'fund-pie-center-sub');

  const spentOfInPct = totalIn > 0 ? Math.min(999, (totalOut / totalIn) * 100) : 0;

  const showDefaultCenter = () => {
    if (totalFlow === 0) {
      centerTop.text('Quỹ chung');
      centerValue.text('0đ').attr('fill', '#64748b');
      centerSub.text('Chưa có giao dịch');
      return;
    }
    centerTop.text('Số dư quỹ');
    centerValue
      .text(formatCompactVND(summary.fundBalance))
      .attr('fill', summary.fundBalance < 0 ? '#dc2626' : '#0f172a');
    centerSub.text(
      totalIn > 0
        ? `Đã chi ${formatPercentVN(spentOfInPct)} thu`
        : `${transactions.length} giao dịch`,
    );
  };

  const showSliceCenter = (datum: FundSliceDatum) => {
    centerTop.text(datum.shortLabel);
    centerValue.text(formatPercentVN(datum.percent)).attr('fill', datum.hoverColor);
    centerSub.text(formatCompactVND(datum.amount));
  };

  showDefaultCenter();

  if (activeSlices.length === 0) {
    const emptyArc = d3
      .arc<unknown>()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .startAngle(0)
      .endAngle(Math.PI * 2);

    g.append('path')
      .attr('d', emptyArc({}) ?? '')
      .attr('fill', '#e2e8f0');
    return;
  }

  const pie = d3
    .pie<FundSliceDatum>()
    .value((d) => d.amount)
    .sort(null)
    .padAngle(activeSlices.length > 1 ? 0.035 : 0);

  const baseArc = d3
    .arc<d3.PieArcDatum<FundSliceDatum>>()
    .innerRadius(innerRadius)
    .outerRadius(radius)
    .cornerRadius(activeSlices.length > 1 ? 5 : 0);

  const hoverArc = d3
    .arc<d3.PieArcDatum<FundSliceDatum>>()
    .innerRadius(innerRadius - 1)
    .outerRadius(radius + 5)
    .cornerRadius(activeSlices.length > 1 ? 6 : 0);

  const pieData = pie(activeSlices);

  const paths = g
    .selectAll<SVGPathElement, d3.PieArcDatum<FundSliceDatum>>('path.fund-pie-slice')
    .data(pieData)
    .enter()
    .append('path')
    .attr('class', 'fund-pie-slice')
    .attr('data-slice-key', (d) => d.data.key)
    .attr('fill', (d) => d.data.color)
    .attr('tabindex', '0')
    .attr('role', 'button')
    .attr(
      'aria-label',
      (d) =>
        `${d.data.label}: ${formatVND(d.data.amount)} (${formatPercentVN(d.data.percent)})`,
    );

  paths
    .append('title')
    .text(
      (d) =>
        `${d.data.label}: ${formatVND(d.data.amount)} (${formatPercentVN(d.data.percent)})`,
    );

  if (prefersReducedMotion) {
    paths.attr('d', baseArc);
  } else {
    paths
      .attr('d', (d) => baseArc({...d, endAngle: d.startAngle}) ?? '')
      .transition()
      .duration(260)
      .ease(d3.easeCubicOut)
      .attrTween('d', (d) => {
        const interp = d3.interpolate(d.startAngle, d.endAngle);
        return (t) => baseArc({...d, endAngle: interp(t)}) ?? '';
      });
  }

  const setHighlightedSlice = (key: 'in' | 'out' | null) => {
    paths.each(function (d) {
      const pathEl = d3.select(this);
      const isMatch = key === d.data.key;
      const isDimmed = key !== null && !isMatch;
      const targetArc = isMatch ? hoverArc : baseArc;

      if (prefersReducedMotion) {
        pathEl
          .attr('d', targetArc(d) ?? '')
          .attr('fill', isMatch ? d.data.hoverColor : d.data.color)
          .attr('opacity', isDimmed ? 0.45 : 1);
      } else {
        pathEl
          .interrupt()
          .transition()
          .duration(150)
          .attr('d', targetArc(d) ?? '')
          .attr('fill', isMatch ? d.data.hoverColor : d.data.color)
          .attr('opacity', isDimmed ? 0.45 : 1);
      }
    });

    if (legendRoot) {
      legendRoot.querySelectorAll<HTMLElement>('[data-fund-slice]').forEach((row) => {
        row.classList.toggle('is-highlighted', key !== null && row.dataset.fundSlice === key);
      });
    }

    if (key === null) {
      showDefaultCenter();
    } else {
      const target = slices.find((s) => s.key === key);
      if (target) showSliceCenter(target);
    }
  };

  paths
    .on('mouseenter', (_event, d) => setHighlightedSlice(d.data.key))
    .on('mouseleave', () => setHighlightedSlice(null))
    .on('focus', (_event, d) => setHighlightedSlice(d.data.key))
    .on('blur', () => setHighlightedSlice(null));

  if (legendRoot) {
    legendRoot.querySelectorAll<HTMLElement>('[data-fund-slice]').forEach((row) => {
      const key = row.dataset.fundSlice as 'in' | 'out' | undefined;
      if (!key) return;
      row.addEventListener('mouseenter', () => setHighlightedSlice(key));
      row.addEventListener('mouseleave', () => setHighlightedSlice(null));
      row.addEventListener('focus', () => setHighlightedSlice(key));
      row.addEventListener('blur', () => setHighlightedSlice(null));
    });
  }
}

export function getFundBreakdownStats(
  summary: FinancialSummary,
  transactions: FundTransaction[],
): {
  inPctLabel: string;
  outPctLabel: string;
  initialTotal: number;
  contributionTotal: number;
  expenseCount: number;
  inCount: number;
} {
  const totalIn = Math.max(0, summary.fundTotalIn);
  const totalOut = Math.max(0, summary.fundTotalOut);
  const totalFlow = totalIn + totalOut;

  let initialTotal = 0;
  let contributionTotal = 0;
  let expenseCount = 0;
  let inCount = 0;

  for (const t of transactions) {
    if (t.type === FundTransactionType.INITIAL) {
      initialTotal += t.amount;
      inCount += 1;
    } else if (t.type === FundTransactionType.CONTRIBUTION) {
      contributionTotal += t.amount;
      inCount += 1;
    } else if (t.type === FundTransactionType.EXPENSE) {
      expenseCount += 1;
    }
  }

  return {
    inPctLabel: totalFlow > 0 ? formatPercentVN((totalIn / totalFlow) * 100) : '0%',
    outPctLabel: totalFlow > 0 ? formatPercentVN((totalOut / totalFlow) * 100) : '0%',
    initialTotal,
    contributionTotal,
    expenseCount,
    inCount,
  };
}
