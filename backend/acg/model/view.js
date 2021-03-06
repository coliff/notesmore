
const _ = require('lodash')
  , jsonPatch = require('fast-json-patch')
  , NodeCache = require("node-cache")
  , uuidv4 = require('uuid/v4')
  , Document = require('./document')
  , {uniqueId, inherits, createEntity, getEntity} = require('./utils');

const
  VIEWS = '.views';

var elasticsearch, cache;

function View(domainId, viewData) {
  Document.call(this, domainId, VIEWS, viewData);
}

function _joinIndices(domainId, collections){
  if(_.isEmpty(collections)){
    return domainId + '~*~all~snapshots';
  } else {
    return _.reduce(collections, function(result, value, key) {
      result.push(domainId+'~'+value+'~all~snapshots');
      return result;
    }, []).join(',');
  }
}

function _buildMQuery(domainId, collections, query){
  var mQuery = [], q = _.cloneDeep(query);
  _.merge(q, q.body);
  delete q.body;
  if(_.isEmpty(collections)){
    mQuery.push({index: domainId + '~*~all~snapshots', type: Document.TYPE});
    mQuery.push(q);
  }else{
    _.each(collections, function(value, key) {
      mQuery.push({index: domainId + '~' + value + '~all~snapshots'});
      mQuery.push(q);
    });
  }
  return mQuery;
}

_.assign(View, {
  
  init: function(config) {
    elasticsearch = config.elasticSearch;
    cache = new NodeCache(config.ncConfig);
    return View;
  },

  create: function(authorId, domainId, viewId, viewData, options) {
    if(!_.at(viewData, '_meta.metaId')[0]) _.set(viewData, '_meta.metaId', '.meta-view');
    return createEntity(elasticsearch, authorId, domainId, VIEWS, viewId, viewData, options).then((source) => {
      var view = new View(domainId, source);
      cache.set(uniqueId(domainId, VIEWS, viewId), view);
      return view;
    });
  },

  get: function(domainId, viewId, options) {
    var uid = uniqueId(domainId, VIEWS, viewId), version = _.at(options, 'version')[0], view;
    uid = version ? uid + '~' + version : uid;
    view = cache.get(uid);
    if(view){
      return Promise.resolve(view);
    }else{
      return getEntity(elasticsearch, domainId, VIEWS, viewId, options).then(source => {
        view = new View(domainId, source);
        cache.set(uid, view);
        return view;
      });
    }
  },  

  find: function(domainId, query, options){
    return Document.find.call(this, domainId, VIEWS, query, options);
  }

});

inherits(View, Document,{
  _getElasticSearch: function() {
    return elasticsearch;
  },

  _getCache: function() {
    return cache;
  },

  findDocuments: function(query, options) {
    query.index = _joinIndices(this.domainId, this.collections);
    query.type = Document.TYPE;
    
    if(options&&options.sort) query.body.sort = options.sort;
    if(options&&options.from) query.from = options.from;
    if(options&&options.size) query.size = options.size;
    if(options&&options.scroll) query.scroll = options.scroll;

  	return this._getElasticSearch().search(query).then(function(data){
  	  var result = {
  	    total:data.hits.total,
  	    offset: query.from || 0,
  	    documents: _.reduce(data.hits.hits, function(r, v, k){
  	      var doc = _.cloneDeep(v._source);
  	      doc.id = doc.id || v._id;
  	      _.set(doc, '_meta.index', v._index);
  	      r.push(doc);
  	      return r;  	        	      
  	    },[])
  	  };
  	  
  	  if(data._scroll_id) result.scrollId = data._scroll_id;
  	  
  	  return result;
  	});
  },

  distinctQuery: function(field, options) {
    const query = {
      aggs: {
        values: {
          terms: {
            field: field + ".keyword",
            include: ".*",
//             order: {
//               _key: "desc"
//             },
            size: 100
          }
        }
      }
    };

    _.merge(query.aggs.values.terms, options);

    return this._getElasticSearch().search({
      index: _joinIndices(this.domainId, this.collections),
      type: Document.TYPE,
      body: query, 
      size:0
    }).then(function(data){
      return {values:_.reduce(data.aggregations.values.buckets, function(r,v,k){
        r.push(v['key']);
        return r;
      },[])};
    });
  },

  refresh: function(options) {
    return this._getElasticSearch().indices.refresh({ index: _joinIndices(this.domainId, this.collections) });
  }

});

module.exports = View;
