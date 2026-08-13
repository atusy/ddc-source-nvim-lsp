local MiniTest = require("mini.test")
local expect = MiniTest.expect

local T = MiniTest.new_set()

T["language identities use independent scratch documents"] = function()
  local cmdline = require("ddc_source_nvim_lsp.cmdline")
  local input = cmdline.ensure_buffer("ddc-input")
  local history = cmdline.ensure_buffer("ddc-history")
  expect.no_equality(input.bufnr, history.bufnr)
  expect.equality(input.uri, "untitled://ddc-cmdline/ddc-input")
  expect.equality(history.uri, "untitled://ddc-cmdline/ddc-history")
end

T["a wiped scratch document is recreated"] = function()
  local cmdline = require("ddc_source_nvim_lsp.cmdline")
  local first = cmdline.ensure_buffer("ddc-wipe")
  vim.api.nvim_buf_delete(first.bufnr, { force = true })
  local second = cmdline.ensure_buffer("ddc-wipe")
  expect.no_equality(first.bufnr, second.bufnr)
  expect.equality(second.uri, first.uri)
  expect.equality(vim.api.nvim_buf_is_loaded(second.bufnr), true)
end

T["an unloaded scratch document is safely reusable"] = function()
  local cmdline = require("ddc_source_nvim_lsp.cmdline")
  local first = cmdline.ensure_buffer("ddc-unload")
  vim.bo[first.bufnr].bufhidden = "hide"
  vim.api.nvim_buf_delete(first.bufnr, { unload = true })
  expect.equality(vim.api.nvim_buf_is_valid(first.bufnr), true)
  expect.equality(vim.api.nvim_buf_is_loaded(first.bufnr), false)
  local second = cmdline.ensure_buffer("ddc-unload")
  expect.equality(second, first)
  expect.equality(vim.api.nvim_buf_is_loaded(second.bufnr), true)
end

T["synchronous requests honor the configured timeout boundary"] = function()
  local cmdline = require("ddc_source_nvim_lsp.cmdline")
  local original = vim.lsp.get_client_by_id
  local observed = {}
  vim.lsp.get_client_by_id = function(id)
    expect.equality(id, 17)
    return {
      request_sync = function(_, method, params, timeout, bufnr)
        observed = { method = method, params = params, timeout = timeout, bufnr = bufnr }
        return { result = { items = {} } }
      end,
    }
  end

  local ok, result = pcall(
    cmdline.request_sync,
    17,
    "textDocument/completion",
    { position = { line = 0, character = 3 } },
    125,
    23
  )
  vim.lsp.get_client_by_id = original
  if not ok then
    error(result)
  end

  expect.equality(result, { items = {} })
  expect.equality(observed, {
    method = "textDocument/completion",
    params = { position = { line = 0, character = 3 } },
    timeout = 125,
    bufnr = 23,
  })
end

return T
