import {REMINDER_OPTIONS, ROLE_LABELS} from '../constants';
import {AppState, FamilyGroup, FamilyMember, MemberRole} from '../types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MEMBER_ROLES: MemberRole[] = [
  MemberRole.ADMIN,
  MemberRole.MEMBER,
  MemberRole.VIEWER,
];

export interface FamilySettingsRenderOptions {
  family: FamilyGroup;
  state: AppState;
  confirmResetPending: boolean;
  isEditingFamilyInfo: boolean;
  familyInfoError: string;
  isAddingMember: boolean;
  editingMember: FamilyMember | null;
  confirmDeleteMemberId: string | null;
  memberFormError: string;
}

/**
 * Renders the 2D Family Info & Members (full CRUD), Smart Reminders, and JSON Backup/Restore settings tab.
 */
export function renderFamilySettingsSection(opts: FamilySettingsRenderOptions): string {
  const {
    family,
    state,
    confirmResetPending,
    isEditingFamilyInfo,
    familyInfoError,
    isAddingMember,
    editingMember,
    confirmDeleteMemberId,
    memberFormError,
  } = opts;

  const showMemberForm = isAddingMember || Boolean(editingMember);

  const memberFormMarkup = showMemberForm
    ? `
      <form id="family-member-form" class="family-inline-editor">
        <input type="hidden" name="memberId" value="${escapeHtml(editingMember?.id ?? '')}" />
        <div class="family-editor-head">
          <h3 class="family-editor-title">
            ${editingMember ? `Chỉnh sửa thành viên · ${escapeHtml(editingMember.fullName)}` : 'Thêm thành viên mới'}
          </h3>
          <button type="button" class="row-edit-link" data-action="cancel-member-form">Đóng</button>
        </div>

        <div class="form-grid-2">
          <label class="form-field">
            <span>Họ và tên <span class="req">*</span></span>
            <input
              id="member-fullname-input"
              type="text"
              name="fullName"
              required
              value="${escapeHtml(editingMember?.fullName ?? '')}"
              placeholder="VD: Mai Văn Hùng"
            />
          </label>

          <label class="form-field">
            <span>Quan hệ <span class="req">*</span></span>
            <input
              type="text"
              name="relation"
              required
              value="${escapeHtml(editingMember?.relation ?? '')}"
              placeholder="VD: Trưởng họ, Chủ hộ, Con trai..."
            />
          </label>

          <label class="form-field">
            <span>Số điện thoại</span>
            <input
              type="tel"
              name="phone"
              value="${escapeHtml(editingMember?.phone ?? '')}"
              placeholder="VD: 0903 128 456"
            />
          </label>

          <label class="form-field">
            <span>Quyền hạn</span>
            <select name="role">
              ${MEMBER_ROLES.map(
                (role) => `
                <option value="${role}" ${(editingMember?.role ?? MemberRole.MEMBER) === role ? 'selected' : ''}>
                  ${escapeHtml(ROLE_LABELS[role])}
                </option>
              `,
              ).join('')}
            </select>
          </label>
        </div>

        ${memberFormError ? `<div class="form-error-msg">${escapeHtml(memberFormError)}</div>` : ''}

        <div class="family-editor-footer">
          <button type="button" class="btn-secondary" data-action="cancel-member-form">Hủy</button>
          <button type="submit" class="btn-primary">
            ${editingMember ? 'Lưu thay đổi' : 'Thêm thành viên'}
          </button>
        </div>
      </form>
    `
    : '';

  const familyHeaderMarkup = isEditingFamilyInfo
    ? `
      <form id="family-info-form" class="family-inline-editor family-info-editor">
        <div class="family-editor-head">
          <h3 class="family-editor-title">Chỉnh sửa tên &amp; mô tả nhóm</h3>
          <button type="button" class="row-edit-link" data-action="cancel-edit-family">Đóng</button>
        </div>
        <div class="form-grid-2">
          <label class="form-field form-span-2">
            <span>Tên nhóm / Gia tộc <span class="req">*</span></span>
            <input
              id="family-name-input"
              type="text"
              name="familyName"
              required
              value="${escapeHtml(family.name)}"
              placeholder="VD: Gia tộc họ Mai Văn"
            />
          </label>
          <label class="form-field form-span-2">
            <span>Mô tả ngắn</span>
            <input
              type="text"
              name="familyDescription"
              value="${escapeHtml(family.description)}"
              placeholder="VD: Quản lý ngày giỗ, ngày chạp, đám hiếu hỉ và quỹ dòng họ"
            />
          </label>
        </div>
        ${familyInfoError ? `<div class="form-error-msg">${escapeHtml(familyInfoError)}</div>` : ''}
        <div class="family-editor-footer">
          <button type="button" class="btn-secondary" data-action="cancel-edit-family">Hủy</button>
          <button type="submit" class="btn-primary">Lưu thông tin</button>
        </div>
      </form>
    `
    : `
      <div class="list-header family-members-header">
        <div class="family-header-info">
          <h2 class="list-heading">Thành viên · ${escapeHtml(family.name)}</h2>
          <p class="fund-chart-subtitle">${escapeHtml(family.description || 'Chưa có mô tả cho nhóm này.')}</p>
        </div>
        <div class="family-header-actions">
          <span class="list-count tabular-nums">${family.members.length} thành viên</span>
          <button
            type="button"
            class="btn-secondary btn-compact"
            data-action="open-edit-family"
          >Sửa thông tin</button>
          <button
            type="button"
            class="btn-primary btn-compact"
            data-action="open-add-member"
          >+ Thêm thành viên</button>
        </div>
      </div>
    `;

  return `
    <section class="settings-grid">
      <div class="event-list-section family-members-card">
        ${familyHeaderMarkup}
        ${memberFormMarkup}

        <div class="table-wrap">
          <table class="data-table family-members-table">
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Quan hệ</th>
                <th>Số điện thoại</th>
                <th>Quyền hạn</th>
                <th class="col-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${
                family.members.length === 0
                  ? `
                <tr>
                  <td colspan="5" class="table-empty">
                    <div>Chưa có thành viên nào trong nhóm này.</div>
                    <button
                      type="button"
                      class="inline-meta-link family-empty-cta"
                      data-action="open-add-member"
                    >+ Thêm thành viên đầu tiên</button>
                  </td>
                </tr>
              `
                  : family.members
                      .map((m) => {
                        const isEditing = editingMember?.id === m.id;
                        const isConfirmingDelete = confirmDeleteMemberId === m.id;
                        const roleClass =
                          m.role === MemberRole.ADMIN
                            ? 'member-role-admin'
                            : m.role === MemberRole.VIEWER
                              ? 'member-role-viewer'
                              : 'member-role-member';
                        return `
                <tr class="${isEditing ? 'is-editing' : ''}">
                  <td>
                    <div class="td-primary">${escapeHtml(m.fullName)}</div>
                  </td>
                  <td>${escapeHtml(m.relation)}</td>
                  <td class="tabular-nums nowrap">${escapeHtml(m.phone ?? '—')}</td>
                  <td><span class="${roleClass}">${escapeHtml(ROLE_LABELS[m.role])}</span></td>
                  <td class="col-right nowrap">
                    <div class="member-row-actions">
                      <button
                        type="button"
                        class="row-edit-link"
                        data-action="edit-member"
                        data-id="${escapeHtml(m.id)}"
                      >${isEditing ? 'Đang sửa' : 'Sửa'}</button>
                      <span class="sep" aria-hidden="true">·</span>
                      <button
                        type="button"
                        class="note-delete-link ${isConfirmingDelete ? 'is-confirming' : ''}"
                        data-action="delete-member"
                        data-id="${escapeHtml(m.id)}"
                      >${isConfirmingDelete ? 'Xác nhận xóa' : 'Xóa'}</button>
                    </div>
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

      <div class="settings-side-stack">
        <div class="settings-card">
          <h3 class="list-heading">Nhắc lịch sự kiện tự động</h3>
          <p class="fund-chart-subtitle">Chọn các mốc thời gian cảnh báo trước ngày giỗ, ngày đám.</p>

          <label class="check-row settings-toggle-row">
            <input
              type="checkbox"
              data-action="toggle-reminders-enabled"
              ${state.reminderSettings.enabled ? 'checked' : ''}
            />
            <span><strong>Bật nhắc nhở sự kiện sắp tới</strong></span>
          </label>

          <div class="reminder-check-row">
            ${REMINDER_OPTIONS.map(
              (opt) => `
              <label class="check-inline">
                <input
                  type="checkbox"
                  data-action="toggle-reminder-offset"
                  data-offset="${opt.offset}"
                  ${state.reminderSettings.defaultOffsets.includes(opt.offset) ? 'checked' : ''}
                  ${state.reminderSettings.enabled ? '' : 'disabled'}
                />
                <span>${escapeHtml(opt.label)}</span>
              </label>
            `,
            ).join('')}
          </div>

          <div class="settings-actions">
            <button type="button" class="btn-secondary" data-action="request-browser-notif">
              ${state.reminderSettings.browserNotifications ? 'Thông báo trình duyệt: Đang bật' : 'Bật thông báo trình duyệt'}
            </button>
          </div>
        </div>

        <div class="settings-card">
          <h3 class="list-heading">Sao lưu &amp; Dữ liệu</h3>
          <p class="fund-chart-subtitle">
            Dữ liệu của bạn được lưu tự động trên trình duyệt. Có thể xuất tệp JSON để sao lưu bất cứ lúc nào.
          </p>
          <div class="settings-actions">
            <button type="button" class="btn-secondary" data-action="export-backup">
              Tải sao lưu JSON
            </button>
            <button
              type="button"
              class="btn-danger-ghost ${confirmResetPending ? 'is-confirming' : ''}"
              data-action="reset-demo"
            >
              ${confirmResetPending ? 'Nhấn lại để khôi phục dữ liệu mẫu' : 'Khôi phục dữ liệu mẫu'}
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}
