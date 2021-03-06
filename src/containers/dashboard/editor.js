import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators }  from 'redux'
import {
  Button, Dropdown, Menu, Input, Icon, Table, Checkbox,
  Form, Select, Modal, message, Row, Col, Tabs
} from 'antd'
import { UnControlled as CodeMirror } from 'react-codemirror2'
import 'codemirror/lib/codemirror'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/addon/edit/matchbrackets'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/lib/codemirror.css'

import { fromJSONString, toJSONString } from '../../common/convert_utils'
import inspector from '../../common/inspector'
import { Player } from '../../common/player'
import csIpc from '../../common/ipc/ipc_cs'
import * as actions from '../../actions'
import * as C from '../../common/constant'

const availableCommands = [
  'open',
  'click',
  'clickAndWait',
  'select',
  'selectAndWait',
  'type',
  'pause',
  'waitForPageToLoad',
  'selectFrame',
  'assertAlert',
  'assertConfirmation',
  'assertPrompt',
  'answerOnNextPrompt',
  'store',
  'storeText',
  'storeTitle',
  'storeAttribute',
  'assertText',
  'assertTitle',
  'clickAt',
  'echo',
  'mouseOver',
  'storeEval',
  'verifyText',
  'verifyTitle',
  'sendKeys',
  'dragAndDropToObject',
  'selectWindow',
  'captureScreenshot',
  'refresh',
  'verifyElementPresent',
  'assertElementPresent',
  'deleteAllCookies',
  'label',
  'gotoLabel',
  'gotoIf',
  'while',
  'endWhile',
  'csvRead',
  'csvSave',
  'if',
  'else',
  'endif',
  'storeValue',
  'assertValue',
  'verifyValue',
  'captureEntirePageScreenshot',
  'assertEqual',
  'assertNotEqual',
  'assertTrue',
  'assertAlert',
  'assertChecked',
  'assertElementPresent',
  'assertSelectedValue',
  'containsString',
  'checkIfPersian',
  'checkLength',
  'greaterThan',
  'lessThan'
]

availableCommands.sort()

const newCommand = {
  cmd: '',
  target: '',
  value: ''
}

const defaultDataSource = [newCommand]

class DashboardEditor extends React.Component {
  state = {
    activeTabForCommands: 'table_view',
    sourceText: '',
    sourceTextModified: null,
    sourceErrMsg: null,
    cursor: null,

    contextMenu: {
      x: null,
      y: null,
      isShown: false
    }

  }

  editingToSourceText = (editing) => {
    const { commands, meta } = editing
    const { src }   = meta
    const toConvert = {
      commands: commands.filter(c => !!c),
      name: src ? src.name : 'Untitled' }

    const text = toJSONString(toConvert)

    return {
      sourceText: text,
      sourceTextModified: text,
      sourceErrMsg: null,
      cursor: { line: 0, ch: 0 }
    }
  }

  onDetailChange = (key, value) => {
    this.props.updateSelectedCommand({[key]: value})
  }

  onChangeCommandsView = (type) => {
    switch (type) {
      case 'table_view':
      case 'source_view': {
        const forceType = this.state.sourceErrMsg ? 'source_view' : type

        this.setState({
          activeTabForCommands: forceType
        })

        if (type === 'source_view' && this.codeMirror && this.state.cursor) {
          // Note: must delay a while so that focus will take effect
          setTimeout(() => {
            this.codeMirror.setCursor(this.state.cursor, true, true)
          }, 200)
        }

        break
      }
    }
  }

  onSourceBlur = () => {
    try {
      const { sourceTextModified, sourceText } = this.state

      // Note: save some effort if text is not changed
      if (sourceText === sourceTextModified)  return

      const obj = fromJSONString(sourceTextModified, 'untitled')

      this.setState({
        sourceErrMsg: null
      })

      this.props.setEditing({
        ...obj.data,
        meta: this.props.editing.meta
      })
    } catch (e) {
      this.setState({
        sourceErrMsg: e.message
      })

      message.error('There are errors in the source')
      return false
    }
  }

  onChangeEditSource = (editor, data, text) => {
    this.setState({
      sourceTextModified: text
    })
  }

  onClickFind = () => {
    const { lastOperation }   = this.state
    const { commands, meta }  = this.props.editing
    const { selectedIndex }   = meta
    const selectedCmd         = commands[selectedIndex]

    csIpc.ask('PANEL_HIGHLIGHT_DOM', {
      lastOperation,
      locator: selectedCmd.target
    })
    .catch(e => {
      message.error(e.message, 1.5)
    })
  }

  onToggleInspect = () => {
    if (this.props.status === C.APP_STATUS.INSPECTOR) {
      this.props.stopInspecting()
    } else {
      this.props.startInspecting()
    }
  }

  componentDidMount () {
    this.bindContextMenuEvent()
  }

  componentWillReceiveProps (nextProps) {
    // Note: update sourceText whenever editing changed
    if (nextProps.editing.meta.src !== this.props.editing.meta.src) {
      this.setState(
        this.editingToSourceText(nextProps.editing)
      )
    }

    if (nextProps.status === C.APP_STATUS.PLAYER &&
        nextProps.player.nextCommandIndex !== this.props.player.nextCommandIndex) {
      const $tableBody = document.querySelector('.table-wrapper')
      const itemHeight = 45

      if (!$tableBody) return

      $tableBody.scrollTop = itemHeight * nextProps.player.nextCommandIndex
    }

    if (nextProps.status === C.APP_STATUS.RECORDER &&
        nextProps.editing.commands.length > this.props.editing.commands.length) {
      const $tableBody = document.querySelector('.table-wrapper')
      const itemHeight = 45

      if (!$tableBody) return

      setTimeout(
        () => { $tableBody.scrollTop = itemHeight * nextProps.editing.commands.length * 2 },
        100
      )
    }
  }

  isPlayerStopped () {
    return this.props.player.status === C.PLAYER_STATUS.STOPPED
  }

  bindContextMenuEvent () {
    const $table        = document.querySelector('tbody.ant-table-tbody')
    const $menu         = document.getElementById('context_menu')
    const onContextMenu = (e) => {
      if (!inspector.inDom($table, e.target)) return

      const $tr   = inspector.parentWithTag('tr', e.target)
      const index = Array.from($table.children).findIndex($el => $el === $tr)
      if (index === -1) return

      this.setState({
        contextMenu: {
          x: e.clientX,
          y: e.clientY,
          isShown: true,
          commandIndex: index
        }
      })

      this.props.selectCommand(index, true)
      e.preventDefault()
    }

    const onHideMenu = (e) => {
      this.setState({
        contextMenu: {
          ...this.state.contextMenu,
          isShown: false
        }
      })
    }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('click', onHideMenu)
  }

  getTestCaseName = () => {
    const { src } = this.props.editing.meta
    return src && src.name && src.name.length ? src.name : 'Untitled'
  }

  renderContextMenu () {
    const { clipboard }   = this.props
    const { contextMenu } = this.state
    const dw  = document.documentElement.clientWidth
    const dh  = document.documentElement.clientHeight
    const mw  = 240
    let x     = contextMenu.x + window.scrollX
    let y     = contextMenu.y + window.scrollY

    if (x + mw > dw)   x -= mw

    const style = {
      position: 'absolute',
      top: y,
      left: x,
      display: contextMenu.isShown ? 'block' : 'none'
    }

    const menuStyle = {
      width: mw + 'px'
    }

    const { commandIndex } = contextMenu
    const handleClick = (e) => {
      switch (e.key) {
        case 'cut':
          return this.props.cutCommand(commandIndex)
        case 'copy':
          return this.props.copyCommand(commandIndex)
        case 'paste':
          return this.props.pasteCommand(commandIndex)
        case 'insert':
          return this.props.insertCommand(newCommand, commandIndex + 1)
        case 'run_line': {
          const { commands }  = this.props.editing
          const { src }       = this.props.editing.meta

          this.setState({ lastOperation: 'play' })

          return this.props.playerPlay({
            title: this.getTestCaseName(),
            extra: {
              id: src && src.id
            },
            mode: Player.C.MODE.SINGLE,
            startIndex: commandIndex,
            startUrl: null,
            resources: commands,
            postDelay: this.props.config.playCommandInterval * 1000
          })
        }
        case 'rune_from_here': {
          const { commands }  = this.props.editing
          const { src }       = this.props.editing.meta

          this.setState({ lastOperation: 'play' })

          return this.props.playerPlay({
            title: this.getTestCaseName(),
            extra: {
              id: src && src.id
            },
            mode: Player.C.MODE.STRAIGHT,
            startIndex: commandIndex,
            startUrl: null,
            resources: commands,
            postDelay: this.props.config.playCommandInterval * 1000
          })
        }
      }
    }

    return (
      <div style={style} id="context_menu">
        <Menu onClick={handleClick} style={menuStyle} mode="vertical" selectable={false}>
          <Menu.Item key="cut">Cut</Menu.Item>
          <Menu.Item key="copy">Copy</Menu.Item>
          <Menu.Item key="paste" disabled={clipboard.commands.length === 0}>Paste</Menu.Item>
          <Menu.Divider />
          <Menu.Item key="insert">خط جدید وارد کن</Menu.Item>
          <Menu.Divider />
          <Menu.Item key="run_line">این دستور را اجرا کن</Menu.Item>
          <Menu.Item key="rune_from_here">از این جا اجرا کن</Menu.Item>
        </Menu>
      </div>
    )
  }

  renderTable () {
    const { editing, player } = this.props
    const { nextCommandIndex, errorCommandIndices, doneCommandIndices } = player
    const { commands }  = editing
    const dataSource    = (commands && commands.length ? commands : defaultDataSource)
                            .map((command, i) => ({
                              ...command,
                              key: Math.random()
                            }))
    const editable      = this.isPlayerStopped()

    const columns = [
      { title: 'دستور',  dataIndex: 'cmd',      key: 'cmd',     width: 130 },
      { title: 'هدف',   dataIndex: 'target',   key: 'target',  width: 190 },
      { title: 'مقدار',    dataIndex: 'value',    key: 'value' },
      {
        title: 'اضافه',
        key: 'ops',
        width: 80,
        render: (text, record, index) => {
          return (
            <div>
              <Button
                disabled={!editable}
                shape="circle"
                onClick={(e) => { this.props.removeCommand(index); e.stopPropagation() }}
              >
                <Icon type="minus" />
              </Button>
              <Button
                disabled={!editable}
                shape="circle"
                onClick={(e) => { this.props.duplicateCommand(index); e.stopPropagation() }}
              >
                <Icon type="plus" />
              </Button>
            </div>
          )
        }
      }
    ]

    const tableConfig = {
      dataSource,
      columns,
      pagination: false,
      footer: () => (
        <div className="table-footer" onClick={(e) => {
          this.props.insertCommand(newCommand, commands.length)
        }}>
          اضافه کردن
        </div>
      ),
      onRowClick: (record, index, e) => {
        this.props.selectCommand(index)
      },
      rowClassName: (record, index) => {
        if (index === editing.meta.selectedIndex) {
          return 'selected-command'
        }

        if (index === nextCommandIndex) {
          return 'running-command'
        }

        if (errorCommandIndices.indexOf(index) !== -1) {
          return 'error-command'
        }

        if (doneCommandIndices.indexOf(index) !== -1) {
          return 'done-command'
        }

        return ''
      }
    }

    return <Table {...tableConfig} />
  }

  render () {
    const { status, editing }   = this.props
    const { commands, meta }    = editing
    const { selectedIndex }     = meta

    const isPlayerStopped = this.isPlayerStopped()
    const dataSource    = commands && commands.length ? commands : defaultDataSource
    const selectedCmd   = dataSource[selectedIndex]
    const isCmdEditable = isPlayerStopped && !!selectedCmd
    const isInspecting  = status === C.APP_STATUS.INSPECTOR

    return (
      <div className="editor-wrapper">
        <Tabs
          type="card"
          className="commands-view"
          activeKey={this.state.activeTabForCommands}
          onChange={this.onChangeCommandsView}
        >
          <Tabs.TabPane tab="دید جدولی" key="table_view">
            <div className="form-group table-wrapper" style={{ marginBottom: 0 }}>
              {this.renderTable()}
            </div>

            <div className="form-group fields-wrapper" style={{ marginBottom: 0 }}>
              <Form>
                <Form.Item label="دستور" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
                  <Select
                    showSearch
                    optionFilterProp="children"
                    placeholder="command"
                    disabled={!isCmdEditable}
                    value={selectedCmd && selectedCmd.cmd}
                    onChange={(value) => this.onDetailChange('cmd', value)}
                    filterOption={(input, {key}) => key.toLowerCase().indexOf(input.toLowerCase()) === 0}
                    style={{ width: '60%', marginLeft: '10px' }}
                  >
                    {availableCommands.map(cmd => (
                      <Select.Option value={cmd} key={cmd}>
                        {cmd}
                      </Select.Option>
                    ))}
                  </Select>
                  {selectedCmd && selectedCmd.cmd ? (
                    <a href={`https://a9t9.com/x/idehelp?cmd=${selectedCmd.cmd.toLowerCase()}`} target="_blank">
                      اطلاعات این دستور
                    </a>
                  ) : null}
                </Form.Item>
                <Form.Item label="هدف" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
                  <div>
                    {!selectedCmd || !selectedCmd.targetOptions ||
                      !selectedCmd.targetOptions.length ? (
                      <Input
                        style={{ width: '60%', marginLeft: '10px' }}
                        placeholder="target"
                        disabled={!isCmdEditable}
                        value={selectedCmd && selectedCmd.target}
                        onChange={(e) => this.onDetailChange('target', e.target.value)}
                      />
                    ) : (
                      <Select
                        style={{ width: '60%', marginLeft: '10px' }}
                        placeholder="target"
                        disabled={!isCmdEditable}
                        value={selectedCmd.target}
                        onChange={(val) => this.onDetailChange('target', val)}
                      >
                        {selectedCmd.targetOptions.map(option => (
                          <Select.Option
                            key={option}
                            value={option}
                          >
                            {option}
                          </Select.Option>
                        ))}
                      </Select>
                    )}
                    <Button
                      style={{ marginLeft: '10px' }}
                      disabled={!isCmdEditable}
                      onClick={this.onToggleInspect}
                    >
                      {isInspecting ? (<span>خروج</span>) : (<span>انتخاب</span>)}
                    </Button>
                    <Button
                      disabled={!isCmdEditable}
                      onClick={this.onClickFind}
                    >
                      پیدا کن
                    </Button>
                  </div>
                </Form.Item>
                <Form.Item label="مقدار" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} style={{ marginBottom: 0 }}>
                  <Input
                    disabled={!isCmdEditable}
                    value={selectedCmd && selectedCmd.value}
                    onChange={(e) => this.onDetailChange('value', e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="value"
                  />
                </Form.Item>
              </Form>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane tab="دید کد" key="source_view">
            <pre className="source-error">{this.state.sourceErrMsg}</pre>
            {/*
              Note: have to use UnControlled CodeMirror, and thus have to use two state :
                    sourceText and sourceTextModified
            */}
            <CodeMirror
              ref={el => { this.codeMirror = el }}
              className={this.state.sourceErrMsg ? 'has-error' : 'no-error'}
              value={this.state.sourceText}
              onChange={this.onChangeEditSource}
              onBlur={this.onSourceBlur}
              onCursor={(editor, data) => {
                // Note: when value updated, code mirror will automatically emit onCursor with cursor at bottom
                // It can be tell with `sticky` as null
                if (data.sticky) {
                  this.setState({ cursor: { line: data.line, ch: data.ch } })
                }
              }}
              options={{
                mode: { name: 'javascript', json: true },
                lineNumbers: true,
                matchBrackets: true,
                autoCloseBrackets: true
              }}
            />
          </Tabs.TabPane>
        </Tabs>

        {this.renderContextMenu()}
      </div>
    )
  }
}

export default connect(
  state => ({
    status: state.status,
    editing: state.editor.editing,
    clipboard: state.editor.clipboard,
    player: state.player,
    config: state.config
  }),
  dispatch => bindActionCreators({...actions}, dispatch)
)(DashboardEditor)
