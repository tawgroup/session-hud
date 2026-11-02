# Prompt: tự dựng Session HUD panel trong Claude Code

Andie dựng 02/11/2026 (mod `session-hud`, Claude Code 2.1.316). Copy nguyên khối dưới đây, dán vào Claude Code. Claude sẽ tự load skill `plugin-authoring`, viết mod, rồi hỏi "Turn on the mods Claude writes in this session?". Chọn **Turn them on**. Panel hiện ra khi lượt trả lời kết thúc. Mở lại bằng `/hud`.

Yêu cầu: Claude Code bản có skill `plugin-authoring` (gõ `/plugin-authoring` thử, có là được).

---

```
Dùng skill plugin-authoring, làm cho mình một mod tên "session-hud": một pane nằm bên cạnh chat, tự mở khi session bắt đầu, và có slash command /hud để mở lại.

Pane hiển thị, từ trên xuống:
1. Header: model đang dùng, tên thư mục, session đã chạy bao lâu, đang ở turn số mấy.
2. Git: branch, số commit ahead/behind, số file đang thay đổi (chạy git status sau mỗi turn).
3. Usage: thanh bar context window (% và token đã dùng / tổng), thanh bar rate limit 5h và 7 ngày kèm thời gian còn lại tới lúc reset, chi phí USD. Màu xanh dưới 60%, vàng 60-85%, đỏ trên 85%. Lấy từ event session.measure. Đưa "ctx X% · 5h Y% · $Z" lên status line.
4. Last turn: thời gian chạy, token in (kèm % cache hit), token out. Lấy từ turn.complete, chỉ tính main agent.
5. Running: tool đang chạy ngay lúc này, kèm nhãn ngắn (Bash thì lấy description, Read/Edit thì tên file, Skill thì tên skill) và thời gian đã chạy.
6. Subagents: subagent đã gọi qua tool Agent, loại, mô tả, đang chạy hay xong và mất bao lâu.
7. Skills đã dùng: đếm từ tool call "Skill" (đừng chỉ dựa vào event skill.prompt, vì plugin bảo mật có thể chặn event này).
8. Tools: top 8 tool theo số lần gọi, số lần lỗi màu đỏ. Thêm 1 dòng tổng hợp MCP server đã dùng.
9. Files edited: file đã sửa thành công qua Edit/Write/NotebookEdit, mới nhất trên đầu.
10. Timeline: 6 tool call gần nhất, ✓/✗, giờ, nhãn, thời gian chạy.

Lưu dữ liệu bằng atom trong $.state, có type contract trong types/index.d.ts. Cắt chữ theo độ rộng pane. Xong thì chạy claude plugin validate và type-check, sửa tới khi sạch.
```

---

## Ghi chú

- **Vì sao đếm skill qua tool call:** ở máy Andie, plugin `cc-plugin-sec-default` chạy trước và không chuyển tiếp event `skill.prompt`, nên mod cũ luôn báo "Skills (0)".
- **Ý tưởng lấy từ đâu:** các HUD/status line phổ biến cho Claude Code (claude-hud, ccstatusline) thường có: context %, rate limit, cost, git, tool đang chạy, subagent, todo. Bản này gom hết vào 1 pane.
- **Muốn thêm nữa:** todo list (theo dõi tool TodoWrite), cảnh báo âm thanh khi context trên 85%, nút bấm compact.
- Source mod: repo này (https://github.com/tawgroup/session-hud).
