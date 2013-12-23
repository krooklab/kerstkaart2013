#!/usr/bin/env node

var express = require('express');
var http = require('http')
var path = require('path');
var fs = require('fs');
var async = require('async');
var _ = require('underscore');
var crypto = require('crypto');
var MobileDetect = require('mobile-detect');
var config = require('./config');
var mosaic = require('./mosaic');
var mongobase = require('./mongobase');
var utils = require('./utils');
var twitimage = require('./twitimage');

var ROOTDIR = path.join(__dirname, config.mosaic.folders.root);

var app = express();

app.configure(function(){
	app.set('port', process.env.PORT || 3000);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.favicon());
	app.use(express.logger('tiny'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.cookieParser('kerstkaart2013bbbbb4645sf6s4fs'));
	app.use(express.session());
	app.use(app.router);
	app.use(require('stylus').middleware(__dirname + '/public'));
	app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
	app.use(express.errorHandler());
});

http.createServer(app).listen(app.get('port'), function(){
	console.log("Express server listening on port " + app.get('port'));
});

app.get('/fancybg', function (req, res){
	var md = new MobileDetect(req.headers['user-agent']);

	mongobase.getAllTilesWithTitle(function (err, fulltiles) {
		if(err) return utils.sendError(err, res);

		var tiles = _.map(fulltiles, function (tile){
			return {
				title: tile.title,
				image: '/mosaic/' + tile.tileflying
			};
		});

		tiles = _.shuffle(tiles); //shuffle the tiles

		tiles = tiles.slice(0, 40); // limit to 50 tiles everywhere

		if( md.mobile() ){
			console.log('its a mobile');
			tiles = tiles.slice(0, 16); // limit to 20 tiles on mobile
		}

		res.render('fancybg', {
			title: 'background | MiX Kerstkaart 2013',
			tiles: tiles,
			mobile: md.mobile()
		});
	})
});

app.get('/', function (req, res){
	var md = new MobileDetect(req.headers['user-agent']);
	renderView(req, res, true, md.mobile(), false);  // put the first boolean back on 'true' if your really want the fancy bg
});

app.get('/simple', function (req, res){
	var md = new MobileDetect(req.headers['user-agent']);
	renderView(req, res, false, md.mobile(), false);
});

// force mobile (for testing purposes):
app.get('/mobile', function (req, res){
	renderView(req, res, false, true, false);
});

// force oldfashion upload (for testing purposes):
app.get('/oldfashionupload', function (req, res) {
	var md = new MobileDetect(req.headers['user-agent']);
	renderView(req, res, false, md.mobile(), true);
});

// force desktop
app.get('/desktop', function (req, res) {
	renderView(req, res, false, false, false);
});


function renderView(req, res, fancybg, mobile, forceOldFashionUpload, userid){
	getSomeRandomTilesWithPosition(50, function (err, tiles) {
		if(err) return utils.sendError(err, res);

		res.render('index', {
			title: '| MiX Kerstkaart 2013',
			tiles: tiles,
			card : {
				width: config.mosaic.greetingcard.lowres.width,
				height: config.mosaic.greetingcard.lowres.height,
				mosaicOffsetX: config.mosaic.greetingcard.lowres.offset.x,
				mosaicOffsetY: config.mosaic.greetingcard.lowres.offset.y
			},
			fancybg: fancybg,
			mobile: mobile,
			forceOldFashionUpload: forceOldFashionUpload,
			userid: userid
		});
	});
}



app.post('/xhrupload', function (req, res){
	if(!req.xhr) return utils.sendError(new Error('got no xhr request'), res);

	var size = req.header('x-file-size');
	var type = req.header('x-file-type');
	var name = path.basename(req.header('x-file-name'));


	//name = crypto.createHash('md5').update( ''+(Date.now()) ).digest('hex') + '_' + name;
	name = (Date.now()) + '_' + (utils.removeFileExt(name)).substr(0,6) + path.extname(name) ;
	var uploadedFile = path.join(ROOTDIR, config.mosaic.folders.main, name);

	var ws = fs.createWriteStream( uploadedFile );

	req.on('data', function (data) {
		ws.write(data);
	});

	req.on('end', function () {
		console.log("Upload done");
		ws.end();
		renderMosaic(null, uploadedFile, req, res);
	});
});

app.post('/oldfashionupload', function (req, res) {
	if(!req.files.file) return renderView(req, res, false, false); // just render the normal page


	var name = req.files.file.name;

	name = (Date.now()) + '_' + (utils.removeFileExt(name)).substr(0,6) + path.extname(name) ;
	var uploadedFile = path.join(ROOTDIR, config.mosaic.folders.main, name);

	fs.rename(req.files.file.path, uploadedFile, function (err) {
		if(err) return utils.sendError(err, res);

		var user = {
			userimage: uploadedFile,
		};

		mongobase.saveUser(user, function (err, user) {
			if(err) return utils.sendError(err, res);

			// dont render now, this is an old fashion upload: the browser is loading the page again

			// send user id (generated by DB) back to browser so it can request the creation of its mosaic:
			renderView(req, res, false, false, true, user._id);
		});
	});
});

app.post('/api/startrender', function (req, res) {
	if(!req.body.userid) return utils.sendError(new Error('got no user id'), res);

	mongobase.getUser( req.body.userid, function (err, user) {
		if(err) return utils.sendError(err, res);

		renderMosaic( user, user.userimage, req, res );
	});
});

app.post('/api/uploaddataurl', function (req, res) {
	if(!req.body.dataURL) return utils.sendError(new Error('got no dataURL'), res);

	// incomming data:image/png;base64,iVBORw0KGgoAAAANSUh

	var base64Data = req.body.dataURL.replace(/^data:image\/png;base64,/,"");

	var name = (Date.now()) + '_webcam.png';
	var uploadedFile = path.join(ROOTDIR, config.mosaic.folders.main, name);

	require("fs").writeFile(uploadedFile, base64Data, 'base64', function (err) {
		if(err) return utils.sendError(err, res);


		renderMosaic( null, uploadedFile, req, res );
	});
});

function renderMosaic (user, userimage, req, res) {
	if(!user){
		var user = {
			userimage: userimage
		}

		mongobase.saveUser(user, function (err, user) {
			if(err) return utils.sendError(err, res);

			mosaic.renderMosaic( user, function (err, mosaicimage, user) {
				if(err) return utils.sendError(err, res);

				console.log( "Mosaic ready... sending it back to browser" );
				console.log( utils.wwwdfy(mosaicimage) );
				console.log( "Generating twitpic url" );
				twitimage.twitPicImage(mosaicimage, function (err, twiturl) {
					// dont check errors
					// if twitpic failes, the app still works

					res.send({
						mosaicimage: utils.wwwdfy(mosaicimage),
						userid: user._id,
						twitpic: (twiturl)?twiturl:utils.wwwdfy(mosaicimage),
						sharing: config.sharing
					});
				});



			});
		});
	}else{
		mosaic.renderMosaic( user, function (err, mosaicimage, user) {
			if(err) return utils.sendError(err, res);

			console.log( "Mosaic ready... sending it back to browser" );
			console.log( utils.wwwdfy(mosaicimage) );
			console.log( "Generating twitpic url" );
			twitimage.twitPicImage(mosaicimage, function (err, twiturl) {
				// dont check errors
				// if twitpic failes, the app still works

				res.send({
					mosaicimage: utils.wwwdfy(mosaicimage),
					userid: user._id,
					twitpic: (twiturl)?twiturl:utils.wwwdfy(mosaicimage),
					sharing: config.sharing
				});
			});

		});
	}
}

app.get('/highquality/:userid', function (req, res) {
	res.render('highquality', {
		title: 'Hoge Kwaliteitsversie| MiX Kerstkaart 2013',
		userid: req.params.userid
	});
});

app.post('/api/renderhq', function (req, res) {
	if(!req.body.userid) return utils.sendError(new Error('got no user id'), res);

	mongobase.getUser( req.body.userid, function (err, user) {
		if(err) return utils.sendError(err, res);

		mosaic.renderMosaicHQ( user, function (err, mosaicimageHQ, user) {
			if(err) return utils.sendError(err, res);

			console.log( "Mosaic HQ ready... sending it back to browser" );
			console.log(mosaicimageHQ);
			console.log( utils.wwwdfy(mosaicimageHQ) );
			res.send({
				mosaicimageHQ: utils.wwwdfy(mosaicimageHQ),
				userid: user._id
			});

		});
	});
});

function getSomeRandomTilesWithPosition(nrOfTiles, callback){
	var tilesinfo = utils.getTilesInfo();

	// don't put fake tiles beyond a certain point (defined in config.js)
	var maxTilesHeigh = Math.floor(config.mosaic.greetingcard.dontPutFakeTilesBeyond / config.mosaic.tile.size);
	var maxTiles = maxTilesHeigh * tilesinfo.wide;

	mongobase.getAllTilesWithTitle(function (err, fulltiles) {
		if(err) return callback(err);

		var tiles = _.map(fulltiles, function (tile){
			return {
				title: tile.title,
				image: '/mosaic/' + tile.tileflying
			};
		});


		var possibleIndexes = [];
		for (var i = 0; i < maxTiles; i++) {
			possibleIndexes.push(i);
		};


		tiles = _.shuffle(tiles); //shuffle the tiles
		possibleIndexes = _.shuffle(possibleIndexes); // shuffle possible indexes

		tiles = tiles.slice(0, nrOfTiles);
		// add an index to each tile:
		for (var i = tiles.length - 1; i >= 0; i--) {
			tiles[i].index = possibleIndexes[i];
			tiles[i].top = utils.getTilePosition( possibleIndexes[i] ).y_px,
			tiles[i].left = utils.getTilePosition( possibleIndexes[i] ).x_px,
			tiles[i].size = config.mosaic.tile.size,
			tiles[i].maxsize = config.mosaic.flyingtile.size
		};

		callback( null, tiles );
	});
}

// YOUNES stuff:

app.get('/share', function(req, res){
	res.render('share', {
		title     	: 'Share Your MiX Kerstkaart 2013',
		message 	: 'iwasmixed - We wish you amazing holydays.',
		imgUrl		: 'http://d3j5vwomefv46c.cloudfront.net/photos/large/828376205.jpg',
		pageUrl		: 'http://twitpic.com/dp6z65'
	});
});
