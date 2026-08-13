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

return T
