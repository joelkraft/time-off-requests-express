var express = require('express');
var router = express.Router();

router.param('collectionName', function (req, res, next, collectionName) {
    req.collection = req.db.collection(collectionName)
    return next()
 })

router.get('/users/:id/requests', function (req, res, next) {
  req.collection = req.db.collection('requests')
  req.collection.find({"Employee Email":req.params.id}).toArray(function (e, results) {
    if (e) return next (e)
    res.send(results)
  })
})

router.get('/users', function (req, res, next) {
  req.collection = req.db.collection('requests')
  req.collection.find({}).toArray(function (e, results) {
    if (e) return next (e)
    var saved = []
    res.send(results.filter(function(record){
      if (this.indexOf(record['Employee Email']) === -1) {
        saved.push(record['Employee Email'])
        return true
      } else { return false }
    }, saved).map(function(record){
      return {name: record['Employee'], email: record['Employee Email']}
    }))
  })
})

router.get('/:collectionName', function (req, res, next) {
  req.collection.find({}, {sort: {'_id':-1}}).toArray(function (e, results) {
    if (e) return next (e)
    res.send(results)
  })
})

router.post('/:collectionName', function (req, res, next) {
	req.collection.insert(req.body, {}, function (e, results) {
		if (e) return next (e)
		res.send(results)
	})
})

router.get('/:collectionName/:id', function (req, res, next) {
  req.collection.findById(req.params.id, function (e, result) {
    if (e) return next (e)
    res.send(result)
  })
})

router.put('/:collectionName/:id', function (req, res, next) {
	req.collection.updateById(
		req.params.id, 
		{$set: req.body}, 
		function (e, result) {
			if (e) return next(e)
			res.send((result.ok === 1) ? {msg:'success'} : {msg:'error'})
		}
	)
})

router.delete('/:collectionName/:id', function (req, res, next) {
	req.collection.removeById(req.params.id, function (e, result) {
		if (e) return next(e)
		res.send((result.ok === 1) ? {msg: 'success'} : {msg: 'error'})
	})
})

module.exports = router;
