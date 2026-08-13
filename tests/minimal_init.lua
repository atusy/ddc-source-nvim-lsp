local root = vim.fn.getcwd()
local mini_test_path = vim.env.MINI_TEST_PATH or vim.fs.joinpath(root, ".deps", "mini.nvim")

vim.opt.runtimepath:prepend(root)
vim.opt.runtimepath:append(mini_test_path)

require("mini.test").setup({
	collect = {
		find_files = function()
			return vim.fn.globpath("tests", "test_*.lua", true, true)
		end,
	},
})
