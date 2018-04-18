const Telegraf = require('telegraf')
const Markup = require('telegraf/markup')
const fs = require('fs')
const child_process = require('child_process')

class Markdown {
    static it(text) {
        return '_' + text + '_'
    }

    static bl(text) {
        return '*' + text + '*'
    }

    static cd(text) {
        return '```\n' + text + '\n```'
    }
}

class CommandPlugin {
    constructor(command, icon) {
        this.command = command
        this.icon = icon
    }

    invoke(ctx, markup) {
        ctx.reply('**Generic command**')
    }
}

class UptimePlugin extends CommandPlugin {
    constructor() {
        super('uptime', '\u23F3')
    }

    invoke(ctx, markup) {
        const chatId = ctx.chat.id
        const client = ctx.telegram
        child_process.exec('uptime -p', (err, stdout) => {
            client.sendMessage(
                chatId,
                `\u23F3 ${stdout}`,
                { parse_mode: 'Markdown', reply_markup: markup }
            )
        })
    }
}

class VNStatiPlugin extends CommandPlugin {
    constructor() {
        super('vnstat-hourly', '\uD83D\uDCCA')
    }

    invoke(ctx, markup) {
        const chatId = ctx.chat.id
        const client = ctx.telegram
        child_process.exec('vnstati -h -o /tmp/summary.png', () => {
            console.log('[INFO] Done creating graphical summary! Sending over.')

            client.sendChatAction('upload_photo')
            client.sendPhoto(
                chatId,
                { source: '/tmp/summary.png' },
                { reply_markup: markup }
            )
        })
    }
}

class VNStatPlugin extends CommandPlugin {
    constructor() {
        super('vnstat', '\ud83d\udcca')
    }

    invoke(ctx, markup) {
        const chatId = ctx.chat.id
        const client = ctx.telegram
        child_process.exec('vnstat --json m', (err, stdout) => {
            console.log(`[INFO] Got result: ${stdout}`)
            const result = JSON.parse(stdout)
            client.sendMessage(
                chatId,
                this.formatResult(result),
                { parse_mode: 'Markdown', reply_markup: markup }
            )
        })
        // TODO: Implement ACL
    }

    formatResult(result) {
        const md = Markdown
        let message = `\uD83D\uDCCB ${md.bl("Server traffic stats")}\n`
        result.interfaces.forEach(iface => {
            message += `  Interface: ${md.bl(iface.id)}\n`
            const total = iface.traffic.total
            message += `  Total (Mb): ${this.trafficMessage(total.rx, total.tx)}\n`
            const months = iface.traffic.months
            months.forEach(month => {
                message += `  ${month.date.year}-${month.date.month}: ${this.trafficMessage(month.rx, month.tx)}\n`
            })
        })

        return message
    }

    trafficMessage(rx, tx) {
        const md = Markdown
        return `\u23EC ${md.bl((rx/1024).toFixed(1))} | \u23EB ${md.bl((tx/1024).toFixed(1))}`
    }
}

class Bot {
    constructor(tokenfile, plugins) {
        this.token = Bot.readToken(tokenfile)
        this.bot = new Telegraf(this.token)



        this.plugins = new Map()
        let keyboard = []

        plugins.forEach(plugin => {
            const commandText = `${plugin.icon} ${plugin.command}`
            keyboard.push(commandText)
            this.bot.hears(commandText, ctx => plugin.invoke(ctx, this.markup))
        })

        let current = []
        this.keyboard = []
        let idx = 0
        keyboard.forEach((cmd, idx) => {
            current.push(cmd)
            idx++
            if (idx % 3 == 0) {
                this.keyboard.push(current)
                current = []
            }
        });
        this.keyboard.push(current)
        console.log('[INFO] Keyboard formed:', this.keyboard)
        this.markup = Markup.keyboard(this.keyboard).resize().extra()

        this.bot.start(ctx => ctx.reply('Ahoy there matey! I\'m alive!', this.markup))

        plugins.forEach(plugin => {
            console.log(`[INFO] Adding command ${plugin.command}`)
            if (this.plugins.has(plugin.command)) {
                console.log(`[WARNING] Command already registered: ${plugin.command}`)
            }
            this.plugins.set(plugin.command, plugin)
            this.bot.command('/' + plugin.command, ctx => plugin.invoke(ctx, this.markup))
        })


    }

    start() {
        this.bot.startPolling()
    }

    static readToken(tokenfile) {
        const token = fs.readFileSync(tokenfile, { encoding: 'utf8' })
        return token
    }
}

const tokenfile = __dirname + '/tokenfile'
const bot = new Bot(tokenfile, [new VNStatPlugin(), new VNStatiPlugin(), new UptimePlugin()])

bot.start()
