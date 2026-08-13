local M = {}

-- The "/" after the colon matters: on Unix, nvim_buf_set_name always runs
-- fix_fname -> vim_FullName, which explicitly checks path_with_url() FIRST
-- and copies a matching name verbatim -- before any cwd-relative resolution
-- is attempted (src/nvim/path.c). "untitled:cmdline" (no slash) fails that
-- check and gets resolved into an absolute, cwd-prefixed path instead.
-- A single "/" is sufficient; the second is only for readability.
local CMDLINE_URI = "untitled://cmdline"

---@class ddc_source_lsp_cmdline.Client
---@field id integer
---@field name string
---@field offsetEncoding string
---@field triggerCharacters string[]

---Set 'filetype' while buftype is still "" (the default) so a real FileType
---autocmd fires: that lets vim.lsp.enable() (or a plain `autocmd FileType
---<languageId>`) start and attach a matching client exactly as it would for
---a real file -- no manual client discovery or vim.lsp.start() needed here.
---Once that has had a chance to fire, buftype flips to "nofile" so nothing
---can accidentally write a file named "untitled://cmdline" to disk; the
---already-established LSP attachment and buffer-change tracking are
---unaffected by that flip.
---@param buf integer
---@param languageId string
local function attach(buf, languageId)
  vim.bo[buf].buftype = ""
  vim.bo[buf].filetype = languageId
  vim.bo[buf].buftype = "nofile"
end

---Find or (re-)create the scratch buffer that mirrors the command line, and
---make sure a client for `languageId` is attached to it.
---
---Re-scans nvim_list_bufs() every call instead of caching the bufnr, so a
---wiped buffer (:bufdo bwipeout, a session reload, ...) is simply recreated
---on the next call. When an existing buffer is found but either has no
---completion-capable client attached yet (e.g. the user's LSP config enables
---the client lazily, after the cmdline was first opened) or was set up for a
---different `languageId`, re-attach re-fires the FileType autocmd so a
---newly-available client gets a chance to attach instead of the buffer being
---permanently stuck without one.
---@param languageId string
---@return { bufnr: integer, uri: string }
function M.ensure_buffer(languageId)
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buf) and vim.api.nvim_buf_get_name(buf) == CMDLINE_URI then
      local stale_filetype = vim.bo[buf].filetype ~= languageId
      if stale_filetype then
        -- Detach clients attached for the old filetype first: leaving them
        -- attached would (a) mix stale-language completions into the new
        -- language's results and (b) count toward "already has a client",
        -- masking the fact that the new language's client hasn't attached.
        -- _uninitialized=true: get_clients excludes still-initializing
        -- clients by default, but vim.lsp.start() attaches before
        -- initialization finishes, so a client attached moments ago could
        -- otherwise be missed here and stay attached under the old language.
        for _, client in pairs(vim.lsp.get_clients({ bufnr = buf, _uninitialized = true })) do
          vim.lsp.buf_detach_client(buf, client.id)
        end
      end
      local no_clients = #M.get_clients(buf, languageId) == 0
      if stale_filetype or no_clients then
        attach(buf, languageId)
      end
      return { bufnr = buf, uri = CMDLINE_URI }
    end
  end

  local buf = vim.api.nvim_create_buf(false, false)
  vim.bo[buf].buflisted = false
  vim.bo[buf].swapfile = false
  vim.api.nvim_buf_set_name(buf, CMDLINE_URI)
  attach(buf, languageId)
  return { bufnr = buf, uri = CMDLINE_URI }
end

---@param text string
---@param bufnr integer
---@return boolean
function M.set_lines(bufnr, text)
  if not vim.api.nvim_buf_is_valid(bufnr) then
    return false
  end
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, { text })
  return true
end

---All clients attached to `bufnr` that can serve completion. Plural,
---and no name-based filtering: whichever server(s) vim.lsp.enable()
---(or the user's own FileType autocmd) chose to attach for this
---filetype are queried and their results merged by the caller.
---
---Filters by the "textDocument/completion" method rather than reading
---server_capabilities.completionProvider directly, so servers that add the
---capability later via client/registerCapability are still picked up.
---
---Also cross-checks `client.config.filetypes` against `languageId` when a
---client declares it. This closes a narrow race ensure_buffer's stale-client
---detach can't: a client whose activation was already in flight (e.g. an
---async `root_dir` callback deferred via vim.schedule) when `languageId`
---changed isn't attached yet at detach time, so nothing to detach exists --
---but it can still attach moments later, under the now-stale language.
---Clients with no declared `filetypes` (not configured via
---vim.lsp.config()/enable()) are trusted as-is, since there's nothing to
---cross-check.
---@param bufnr integer
---@param languageId string
---@return ddc_source_lsp_cmdline.Client[]
function M.get_clients(bufnr, languageId)
  local clients = {}
  for _, client in pairs(vim.lsp.get_clients({ bufnr = bufnr, method = "textDocument/completion" })) do
    local filetypes = client.config and client.config.filetypes
    if filetypes == nil or vim.tbl_contains(filetypes, languageId) then
      local completion = client.server_capabilities
        and client.server_capabilities.completionProvider
      table.insert(clients, {
        id = client.id,
        name = client.name,
        offsetEncoding = client.offset_encoding,
        -- Empty (not nil) so the value survives the round trip through
        -- luaeval as a list rather than vanishing from the table.
        triggerCharacters = completion and completion.triggerCharacters or {},
      })
    end
  end
  return clients
end

---Blocks Nvim for up to `timeout` ms. Acceptable for now: the document is a
---single cmdline, and ddc's cmdline "pum" UI has no async placeholder to
---show while waiting. See README limitations for the plan to make this
---non-blocking.
---@param clientId integer
---@param method string
---@param params table
---@param timeout integer
---@param bufnr integer
---@return unknown?
function M.request_sync(clientId, method, params, timeout, bufnr)
  local client = vim.lsp.get_client_by_id(clientId)
  if not client then
    return nil
  end
  local resp = client:request_sync(method, params, timeout, bufnr or 0)
  if resp and resp.err == nil then
    return resp.result
  end
  return nil
end

return M
