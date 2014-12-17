var express = require('express');
var router = express.Router();

router.param('collectionName', function (req, res, next, collectionName) {
    req.collection = req.db.collection(collectionName)
    return next()
 })

router.get('/:collectionName', function (req, res, next) {
console.log('collection, typeof: ' + typeof req.collection)
  req.collection.find({}, {limit:10, sort: {'_id':-1}}).toArray(function (e, results) {
  	if (e) return next (e)
  	res.send(results)
  })
})
router.post('/:collectionName', function (req, res, next) {
	console.log('something was posted. body: ' + req.body)
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
		{safe:true, multi:false},
		function (e, result) {
			if (e) return next(e)
			res.send((result === 1) ? {msg:'success'} : {msg:'error'})
		}
	)
})

router.delete('/:collectionName/:id', function (req, res, next) {
	req.collection.removeById(req.params.id, function (e, result) {
		if (e) return next(e)
		res.send((result === 1) ? {msg: 'success'} : {msg: 'error'})
	})
})

module.exports = router;
