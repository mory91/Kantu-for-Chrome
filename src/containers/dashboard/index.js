import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators }  from 'redux'

import './dashboard.scss'
import * as actions from '../../actions'

import DashboardEditor from './editor'
import DashboardBottom from './bottom'

class Dashboard extends React.Component {
  render () {
    return (
      <div className="dashboard">
        <DashboardEditor />
        <DashboardBottom />
      </div>
    )
  }
}

export default connect(
  state => ({}),
  dispatch => bindActionCreators({...actions}, dispatch)
)(Dashboard)
