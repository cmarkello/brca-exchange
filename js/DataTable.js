/*global module: false, require: false, URL: false, Blob: false */
'use strict';

var React = require('react');
var Rx = require('rx');
require('rx/dist/rx.time');
var {Table, Pagination} = require('react-data-components-bd2k');
var {Button, Row, Col} = require('react-bootstrap');
var VariantSearch = require('./VariantSearch');
var SelectField = require('./SelectField');
var DisclaimerModal = require('./DisclaimerModal');
var ColumnCheckbox = require('./ColumnCheckbox');
var _ = require('underscore');
var cx = require('classnames');
var hgvs = require('./hgvs');
var PureRenderMixin = require('./PureRenderMixin'); // deep-equals version of PRM

var filterDisplay = v => v == null ? 'Any' : v;
var filterAny = v => v === 'Any' ? null : v;
var addAny = opts => ['Any', ...opts];

var pluralize = (n, s) => n === 1 ? s : s + 's';

var merge = (...args) => _.extend({}, ...args);

var Lollipop = require('./d3Lollipop');

function setPages({data, count}, pageLength) {
    return {
        data,
        count,
        totalPages: Math.ceil(count / pageLength)
    };
}

// Wrap Table with a version having PureRenderMixin
var FastTable = React.createClass({
    mixins: [PureRenderMixin],
    render: function () {
        var {dataArray, ...props} = this.props;
        var trimmedData = _.map(dataArray, r =>
            _.mapObject(r, v => v.length > 30 ? v.slice(0, 30) + "..." : v)
        );
        return <Table {...props} dataArray={trimmedData}/>;
    }
});

// Merge new state (e.g. initialState) with existing state,
// deep-merging columnSelect.
function mergeState(state, newState) {
    var {columnSelection, sourceSelection, ...otherProps} = newState,
        cs = {...state.columnSelection, ...columnSelection},
        ss = {...state.sourceSelection, ...sourceSelection};
    return {...state, columnSelection: cs, sourceSelection: ss, ...otherProps};
}

var DataTable = React.createClass({
    mixins: [PureRenderMixin],
    componentWillMount: function () {
        var q = this.fetchq = new Rx.Subject();
        this.subs = q.map(this.props.fetch).debounce(100).switchLatest().subscribe(
            resp => this.setState(setPages(resp, this.state.pageLength)), // set data, count, totalPages
            () => this.setState({error: 'Problem connecting to server'}));
        var qLollipop = this.fetchqLollipop = new Rx.Subject();
        this.subs = qLollipop.map(this.props.fetch).debounce(100).switchLatest().subscribe(
            resp => this.setState(setPages(resp, this.state.pageLength)), // set data, count, totalPages
            () => this.setState({error: 'Problem connecting to server'}));
    },
    componentWillUnmount: function () {
        window.removeEventListener('resize', this.handleResize);
        this.subs.dispose();
    },
    componentDidMount: function () {
        window.addEventListener('resize', this.handleResize);
        this.fetch(this.state);
    },
    getInitialState: function () {
        return mergeState({
            data: [],
            lollipopOpen: false,
            filtersOpen: false,
            filterValues: {},
            search: '',
            columnSelection: this.props.columnSelection,
            sourceSelection: this.props.sourceSelection,
            pageLength: 20,
            page: 0,
            windowWidth: window.innerWidth
        }, this.props.initialState);
    },
    componentWillReceiveProps: function(newProps) {
        var newState = mergeState(this.state, newProps.initialState);
        newState.sourceSelection = newProps.sourceSelection;
        newState.columnSelection = newProps.columnSelection;
        this.setStateFetch(newState);
    },
    handleResize: function(e) {
        this.setState({windowWidth: window.innerWidth});
    },
    setFilters: function (obj) {
        var {filterValues} = this.state,
            newFilterValues = merge(filterValues, obj);

        this.setStateFetch({
          filterValues: newFilterValues,
          page: 0
        });
    },
    createDownload: function () {
        var {search, sortBy, filterValues, columnSelection, sourceSelection} = this.state;
        return this.props.url(merge({
            format: 'csv',
            pageLength: null,
            page: null,
            sortBy,
            search,
            searchColumn: _.keys(_.pick(columnSelection, v => v)),
            source: _.keys(_.pick(sourceSelection, v => v)),
            filterValues}, hgvs.filters(search, filterValues)));
    },
    fetch: function (state) {
        var {pageLength, search, page, sortBy,
            filterValues, columnSelection, sourceSelection} = state;
        this.fetchq.onNext(merge({
            pageLength,
            page,
            sortBy,
            search,
            searchColumn: _.keys(_.pick(columnSelection, v => v)),
            source: _.keys(_.pick(sourceSelection, v => v)),
            filterValues}, hgvs.filters(search, filterValues)));
    },
    fetchLollipopData: function(state) {
        var {search, sortBy, filterValues} = state;
        this.fetchq.onNext(merge({
            pageLength: null,
            page: null,
            sortBy,
            search,
            filterValues}, hgvs.filters(search, filterValues)));
    },
    // helper function that sets state, fetches new data,
    // and updates url.
    setStateFetch: function (opts) {
        var newState = {...this.state, ...opts};
        this.setState(newState);
        this.fetch(newState);
        this.props.onChange(newState);
    },
    toggleLollipop: function () {
        this.setState({lollipopOpen: !this.state.lollipopOpen});
    },
    toggleFilters: function () {
        this.setState({filtersOpen: !this.state.filtersOpen});
    },
    onChangePage: function (pageNumber) {
        this.setStateFetch({page: pageNumber});
    },
    onSort: function(sortBy) {
        this.setStateFetch({sortBy});
    },
    onPageLengthChange: function(txt) {
        var length = parseInt(txt),
            {page, pageLength} = this.state,
            newPage = Math.floor((page * pageLength) / length);

        this.setStateFetch({page: newPage, pageLength: length});
    },
    render: function () {
        var {filterValues, filtersOpen, lollipopOpen, search, data, columnSelection,
            page, totalPages, count, error} = this.state;
        var {columns, filterColumns, className, advancedFilters, downloadButton, lollipopButton, onToggleMode} = this.props;
        var renderColumns = _.filter(columns, c => columnSelection[c.prop]);
        var filterFormEls = _.map(filterColumns, ({name, prop, values}) =>
            <SelectField onChange={v => this.setFilters({[prop]: filterAny(v)})}
                         key={prop} label={`${name} is: `} value={filterDisplay(filterValues[prop])}
                         options={addAny(values)}/>);

        return (error ? <p>{error}</p> :
            <div className={this.props.className}>
                <Row id="show-hide" className="btm-buffer">
                    <Col sm={12}>
                        <Button className="btn-sm rgt-buffer"
                                onClick={this.toggleFilters}>{(filtersOpen ? 'Hide' : 'Show' ) + ' Filters'}
                        </Button>

                        {lollipopButton(this.toggleLollipop, lollipopOpen)}
                    </Col>
                </Row>

                <Row id="filters" className="btm-buffer">
                    <Col sm={12}>
                        {filtersOpen && <div className='form-inline'>{filterFormEls}</div>}
                        {filtersOpen && <div className='form-inline'>
                            {advancedFilters}
                        </div>}
                    </Col>
                </Row>
                <Row id="lollipop-chart">
                    <Col sm={12}>
                        {lollipopOpen && this.state.windowWidth > 991 && this.state.data.length > 0 &&
                        <Lollipop data={this.state.data} onHeaderClick={this.props.onHeaderClick}/> }

                        {lollipopOpen && this.state.windowWidth <= 991 &&
                        <div><span className="label label-danger">Please use a larger screen size to view this interactive chart</span></div>}
                    </Col>
                </Row>

                <Row id="download" className="btm-buffer">
                    <Col sm={6}>
                        <div className='form-inline'>
                            <div className='form-group'>
                                <label className='control-label'>
                                    {count} matching {pluralize(count, 'variant')}
                                </label>
                                {downloadButton(this.createDownload)}
                            </div>
                        </div>
                    </Col>
                    <Col sm={3} smOffset={3}>
                        <div className='form-inline pull-right-sm'>
                            <SelectField
                                label="Page size:"
                                value={this.state.pageLength}
                                options={this.props.pageLengthOptions}
                                onChange={this.onPageLengthChange}
                            />
                        </div>
                    </Col>
                </Row>
                <Row id='variant-search-row' className="btm-buffer">
                    <Col sm={5}>
                        <VariantSearch
                            id='variants-search'
                            value={search}
                            onChange={v => {
                                // reset the page number to zero on new searches
                                this.setStateFetch({search: v, page: 0});
                            }}
                        />
                    </Col>
                    <Col sm={3}>
                        <DisclaimerModal research_mode onToggleMode={onToggleMode} text='Go to research pages'/>
                    </Col>
                    <Col sm={4}>
                        <Pagination
                            className="pagination pull-right-sm"
                            currentPage={page}
                            totalPages={totalPages}
                            onChangePage={this.onChangePage} />
                    </Col>
                </Row>
                <Row>
                    <Col className="table-responsive" sm={12}>
                        <FastTable
                            className={cx(className, "table table-hover table-bordered table-condensed")}
                            dataArray={data}
                            columns={renderColumns}
                            keys={this.props.keys}
                            buildRowOptions={this.props.buildRowOptions}
                            buildHeader={this.props.buildHeader}
                            sortBy={this.state.sortBy}
                            onSort={this.onSort} />
                    </Col>
                </Row>
            </div>
        );
    }
});

module.exports = DataTable;
