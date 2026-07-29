# Orynt Skills Hub

Orynt quản lý **Agent Skills cài đặt trên máy** như một miền riêng với learned
skills do cognitive kernel rút ra. Agent Skill là một thư mục có `SKILL.md`;
learned skill vẫn dùng registry, evidence và promotion lifecycle hiện có.

## Nơi Orynt đọc skill

Thứ tự ưu tiên khi trùng tên:

1. `<repository>/.agents/skills/`
2. `~/.agents/skills/`
3. built-in skills đi kèm Orynt
4. runtime-native catalogs khác được cấu hình read-only

Shared skill root của OS user là nguồn chung cho Claude Code, Codex, OpenCode
và các runtime khác. Orynt không tự ý ghi vào `.claude/`, `.codex/`,
`.opencode/` hoặc `.hermes/`.

Scanner:

- chỉ nhận thư mục thường có `SKILL.md`;
- không đi theo symlink;
- giới hạn độ sâu, số file, kích thước manifest và tổng bundle;
- parse frontmatter theo safe subset, fingerprint canonical bằng SHA-256;
- báo collision, invalid manifest, local drift và shadowing;
- project scope thắng user scope, user scope thắng runtime scope.

Project skills có precedence cao nhưng mặc định là **untrusted** vì nội dung
repository có thể do người khác cung cấp. User skills dưới root do OS user sở
hữu được gắn trusted; trust không tự mở rộng tool hay authorization.

Orynt đi kèm năm built-in skills ở runtime scope:

- `repository-onboarding`: map codebase ở chế độ read-only;
- `change-planner`: tạo implementation plan dựa trên repository thật;
- `bug-fixer`: reproduce, sửa root cause và thêm regression test;
- `code-reviewer`: review diff ở chế độ read-only;
- `release-readiness`: kiểm tra release gate mà không publish hay deploy.

Các skill này có source `orynt-builtin`, được enable sẵn nhưng **không bao giờ
tự attach**. Operator phải chọn skill cho từng run. Built-in bundle là
read-only; project hoặc user skill cùng tên có thể override nhờ precedence cao
hơn. Skill text không cấp thêm tool, network, path hay authorization.

## Desktop

Mở **Account → Skills** để dùng các tab:

- **Installed**: scan, inspect, enable/disable, pin, update, Trash và restore;
- **Discover**: search catalog đã refresh và tạo install plan;
- **Updates**: xem update cần review;
- **Learned**: mở registry learned skills hiện có;
- **Sources**: xem trust, freshness và trạng thái từng nguồn.

Composer chỉ attach những skill đang `enabled`, `eligible` và không bị shadow.
Ngay trước khi chạy, Orynt fingerprint lại bundle và tạo immutable context
snapshot. Manifest của run lưu digest, skill IDs và artifact `skill-context.json`.

## CLI

```text
orynt skills list --repo /path/to/repository
orynt skills check --runtime --json
orynt skills sources
orynt skills sync
orynt skills search react --source openai-plugins
orynt skills install openai-plugins:openai/<skill> --scope user --dry-run
orynt skills install openai-plugins:openai/<skill> --scope user --approve-once
orynt skills import /path/to/local-skill --scope project --dry-run
orynt skills remove <skill-id> --scope user --approve-once
orynt skills history --json
```

Trong interactive CLI:

```text
/skills list
/skills use <skill-id>
/skills remove <skill-id>
/skills clear
```

Attachment được lưu trong session. Mutation headless bắt buộc
`--approve-once`; `--dry-run` chỉ tạo và in immutable plan.

## Catalog và trust

Các nguồn mặc định:

- `orynt-builtin`: năm skill read-only đi kèm build; không cần refresh network.
- `openai-plugins`: catalog plugin hiện tại của OpenAI; chỉ các thư mục thực sự
  có `SKILL.md` được index.
- `hermes-official`: `optional-skills/` từ Hermes Agent.
- `anthropic-official`: chỉ skill folders từ marketplace chính thức; plugin có
  hooks, MCP, LSP, agents, commands hoặc package dependency không được cài như
  một Agent Skill.
- `skills-sh` và `clawhub`: được hiển thị nhưng disabled mặc định cho đến khi
  có adapter catalog được operator bật.

Refresh là thao tác network rõ ràng. Orynt cache catalog, giới hạn response,
timeout request, chỉ chấp nhận HTTPS và không redirect ngầm. Catalog không phải
chứng thực an toàn: community content luôn là untrusted.

## Transaction và recovery

Mọi thay đổi đi qua:

```text
plan → operator approval → execute → rescan
```

Plan có TTL, scope, destination, source fingerprint và trust decision. Install
copy vào staging, kiểm tra fingerprint rồi mới atomic rename. Receipt ghi danh
sách file, digest, source, revision và thời gian. Update/remove bị chặn khi local
files đã drift.

Remove chuyển receipt-owned bundle vào Trash. Restore kiểm tra digest trước khi
đưa lại. Purge chỉ xóa đường dẫn Trash thuộc manager root. Transaction bị ngắt
được ghi failed để operator recovery; Orynt không tự chạy script hoặc cài
dependency bên trong skill.

State mặc định:

```text
$XDG_STATE_HOME/orynt/skills/
# hoặc ~/.local/state/orynt/skills/
```

Có thể đổi bằng `ORYNT_STATE_HOME`. Desktop runner có thể được override cho
development bằng `ORYNT_DESKTOP_SKILL_MANAGER`.

Security boundary: repository content là untrusted; OS-user account đang chạy
Orynt là owner tin cậy của control plane. State directories dùng mode `0700`,
no-follow handles và random transaction IDs. Orynt không cố sandbox một process
độc hại khác đang chạy cùng UID; process cùng UID đã có quyền sửa skill roots,
state và executable của Orynt.

## Giới hạn hiện tại

- `skills.sh` và ClawHub chưa bật remote adapter mặc định.
- GitHub refresh dùng public API và có thể bị rate-limit.
- Bản private beta chưa có signing service hay organization policy feed.
- Project-scope mutation hiện dùng Linux `O_DIRECTORY|O_NOFOLLOW` và pinned
  directory handle; trên platform chưa có boundary tương đương, Orynt fail
  closed. User-scope inventory vẫn đọc được.
- Skill instructions vẫn có thể chứa prompt injection; operator phải review
  capability và nội dung trước khi enable. Skill text không thể mở rộng
  repository scope, expected paths, tool access hoặc destructive authorization.
