// initial parameters (used in setup.js):

exports.mosaic = {
	folders:{
		root       : '/public/mosaic/',
		main       : 'main/',
		bootstrap  : 'bootstrap/',
		user       : 'user/',
		output     : 'output/'
	},
	// mainimage: 'cute-baby-wallpaper1.jpg',
	// mainimage: 'kerstboom_mix.jpg',
	mainimage: 'martijn.jpg',
	maxtiles: 4000,    // aim at x tiles
	aspectratio: 16/9,
	tile:{
		width: 10,
		height: 10
	},
	tilehq:{
		width: 200,
		height: 200
	}
};