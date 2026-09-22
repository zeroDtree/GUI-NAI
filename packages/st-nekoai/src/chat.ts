import { transfer } from '../../nekoai-gui/client/store'
import { t } from '../../nekoai-gui/client/i18n'
import { openPanel } from './bus'

export type STMessage = {
  id?: string | number
  mes?: string
  extra?: Record<string, unknown>
}

export type STContext = {
  chat?: STMessage[]
  chatId?: string
  name2?: string
  saveChat?: () => Promise<void> | void
  saveChatConditional?: () => Promise<void> | void
  getRequestHeaders?: () => Record<string, string>
  eventSource?: {
    on: (name: string, handler: (...args: any[]) => void) => void
    off?: (name: string, handler: (...args: any[]) => void) => void
  }
  eventTypes?: Record<string, string>
  SlashCommandParser?: { addCommandObject: (command: unknown) => void }
  SlashCommand?: { fromProps: (props: unknown) => unknown }
  SlashCommandArgument?: { fromProps: (props: unknown) => unknown }
  registerSlashCommand?: (...args: any[]) => void
  substituteParams?: (text: string) => string
  getCurrentLocale?: () => string
  extensionSettings?: Record<string, any>
  saveSettingsDebounced?: () => void
}

export function getST(): STContext {
  try {
    return window.SillyTavern?.getContext?.() || {}
  } catch {
    return {}
  }
}

function stripHtml(html: string) {
  const node = document.createElement('div')
  node.innerHTML = html
  return (node.textContent || '').replace(/\s+/g, ' ').trim()
}

export function expandPrompt(text: string) {
  const ctx = getST()
  try {
    return ctx.substituteParams?.(text) || text
  } catch {
    return text
  }
}

function fillFromMessage(index: number) {
  const mes = getST().chat?.[index]
  const text = stripHtml(mes?.mes || '')
  if (text) transfer.prompt = expandPrompt(text)
  openPanel('generate')
}

function addFillButtons() {
  document.querySelectorAll('#chat .mes').forEach((el) => {
    if (!(el instanceof HTMLElement)) return
    if (el.querySelector('.nekoai-fill-prompt')) return
    const buttons = el.querySelector('.mes_buttons')
    if (!buttons) return
    const btn = document.createElement('div')
    btn.className = 'mes_button nekoai-fill-prompt fa-solid fa-palette'
    btn.title = t('st.fillPrompt')
    btn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      fillFromMessage(Number(el.getAttribute('mesid')))
    })
    buttons.prepend(btn)
  })
}

function registerSlash() {
  const ctx = getST()
  const run = (_named: unknown, unnamed?: string) => {
    const prompt = typeof unnamed === 'string' ? unnamed.trim() : ''
    if (prompt) transfer.prompt = expandPrompt(prompt)
    openPanel('generate')
    return ''
  }

  try {
    const Parser = ctx.SlashCommandParser || (window as any).SlashCommandParser
    const Command = ctx.SlashCommand || (window as any).SlashCommand
    const Argument = ctx.SlashCommandArgument || (window as any).SlashCommandArgument
    if (Parser?.addCommandObject && Command?.fromProps) {
      Parser.addCommandObject(Command.fromProps({
        name: 'nekoai',
        aliases: ['nai'],
        callback: run,
        helpString: t('st.slashHelp'),
        unnamedArgumentList: Argument?.fromProps ? [
          Argument.fromProps({
            description: t('st.slashPrompt'),
            typeList: ['string'],
            isRequired: false,
          }),
        ] : [],
      }))
      return
    }
  } catch (error) {
    console.warn('[NekoAI] SlashCommandParser unavailable', error)
  }

  try {
    ctx.registerSlashCommand?.('nekoai', (args: string) => run({}, args), ['nai'], t('st.slashHelp'), true, true)
  } catch (error) {
    console.warn('[NekoAI] registerSlashCommand unavailable', error)
  }
}

function addExtensionsMenu() {
  const menu = document.getElementById('extensionsMenu') || document.querySelector('#extensions_settings')
  if (!menu || document.getElementById('nekoai-extensions-menu')) return
  const item = document.createElement('div')
  item.id = 'nekoai-extensions-menu'
  item.className = 'list-group-item flex-container flexGap5'
  item.style.cursor = 'pointer'
  item.innerHTML = '<div class="fa-solid fa-palette"></div><span>NekoAI</span>'
  item.addEventListener('click', () => openPanel('generate'))
  menu.appendChild(item)
}

export function refreshFillTitles() {
  document.querySelectorAll('.nekoai-fill-prompt').forEach((el) => {
    if (el instanceof HTMLElement) el.title = t('st.fillPrompt')
  })
}

export function installChat() {
  registerSlash()
  addFillButtons()
  addExtensionsMenu()

  const ctx = getST()
  const types = ctx.eventTypes || {}
  const events = ['USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'CHAT_CHANGED', 'CHAT_LOADED', 'MESSAGE_EDITED']
  for (const key of events) {
    const name = types[key]
    if (name && ctx.eventSource?.on) ctx.eventSource.on(name, () => addFillButtons())
  }
  document.addEventListener('click', () => addExtensionsMenu(), { once: true })
}
