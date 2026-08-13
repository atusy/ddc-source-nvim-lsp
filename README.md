# ddc-source-nvim-lsp

lsp completion for ddc.vim

## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddc.vim

https://github.com/Shougo/ddc.vim

### LSP client

This source supports Neovim's built-in LSP client and requires Neovim 0.11+.

## Configuration

To take advantage of all the features, you need to set client_capabilities.

```lua
vim.lsp.config('*', {
  capabilities = require("ddc_source_nvim_lsp").make_client_capabilities(),
})
```

```vim
call ddc#custom#patch_global('sources', ['nvim-lsp'])
call ddc#custom#patch_global('sourceOptions', #{
      \   'nvim-lsp': #{
      \     isVolatile: v:true,
      \     mark: 'L',
      \     forceCompletionPattern: '\.\w*|:\w*|->\w*',
      \   },
      \ })

call ddc#custom#patch_global('sourceParams', #{
      \   'nvim-lsp': #{
      \     allowedServers: v:null,
      \     deniedServers: v:null,
      \     snippetEngine: denops#callback#register({
      \           body -> vsnip#anonymous(body)
      \     }),
      \     enableResolveItem: v:true,
      \     enableAdditionalTextEdit: v:true,
      \   }
      \ })
```

`allowedServers` and `deniedServers` contain exact, case-sensitive
`vim.lsp.Client.name` values. Both default to `null`, which targets every
attached completion-capable client. An empty allow list targets no clients; an
empty deny list denies none. If a name occurs in both lists, denial wins. Use
`:=vim.tbl_map(function(c) return c.name end, vim.lsp.get_clients())` to inspect
the names visible to Neovim. A bridge such as kakehashi appears as one client;
these parameters do not select servers hidden behind it.

### Command-line completion

The `nvim-lsp-cmdline` source mirrors the command line into a scratch buffer
and requests completion from Neovim LSP clients attached to its `languageId`.

```vim
call ddc#custom#patch_global('sourceOptions', #{
      \ 'nvim-lsp-cmdline': #{ mark: 'L', isVolatile: v:true },
      \ })
call ddc#custom#patch_global('sourceParams', #{
      \ 'nvim-lsp-cmdline': #{
      \   languageId: 'vim',
      \   allowedServers: v:null,
      \   deniedServers: v:null,
      \   completePosition: 'keyword',
      \ },
      \ })
call ddc#custom#patch_filetype('vim', 'sources', ['nvim-lsp-cmdline'])
```

`allowedServers` and `deniedServers` have the same semantics as the normal
source. Set `completePosition` to `"head"` for providers that return a whole
replacement, such as expression and input completion; its default is
`"keyword"`. Requests currently use Neovim's synchronous LSP API and can block
for the source `timeout`, so keep local cmdline servers fast.

## Original code

It based on [cmp-core-example](https://github.com/hrsh7th/cmp-core-example).
