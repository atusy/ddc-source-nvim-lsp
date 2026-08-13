local expect = MiniTest.expect
local T = MiniTest.new_set()

T["loads the nvim-lsp capability module"] = function()
	local module = require("ddc_source_nvim_lsp")
	expect.equality(type(module.make_client_capabilities), "function")
end

return T
