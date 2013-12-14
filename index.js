// COMET module v0.5

// CLIENT side path creator
function create_clint_side_path(COMET){
	//console.log('COMET.app.public', COMET.app.public)
	var jquery 		= COMET.app.public+'/comet/comet.jquery.client';
	var jel 		= COMET.app.public+'/comet/comet.jel.client';
	fs.writeFileSync(jquery, fs.readFileSync(__dirname+'/comet.jquery.client'), 'utf8');
	fs.writeFileSync(jel, __dirname+'/comet.jel.client', 'utf8');
}

module.exports = function(COMET){
	// SETUP comet
	var comet 		 = {};								// Create Comet Object
	//console.log(COMET.app.use);
	// SETUP mysql
	var MySQLClient  = require('application/lib/mysql');	// Use MySQL Library
	var MySQL 		 = MySQLClient(COMET.app.mysql);
	
	
	// SETUP emitter
	var emitter = new events.EventEmitter();			// Attach an event emitter for Comet
		emitter.setMaxListeners(0); 					// Unlimitied Listeners
		comet.emitter = emitter;
		
		emitter.on('exit', function(session_id){
			if(isset(comet.onExit)) comet.onExit(session_id);
		});
	
	// SETUP comet actions
	comet.actions = {};
	comet.action  = function(action_name, submit_before_emit){
		comet.actions[action_name] = {
			submit_before_emit: submit_before_emit || false,
			finished: {},
			
			// ACTION SUBMIT preprocessor
			onSubmit : function(mysql, request, response, package, private, listener, end){
				comet.actions[action_name]['functions'].onSubmit(
					mysql, request, response, 
					package, private, listener, 
				function(){ // this is the `end` callback in some_action.onSubmit(..., end){}
					// End Submit Request
					end.apply(this, arguments);
					
					// TELL that submit has finished
					if(isset(submit_before_emit)){
						// SHORTCUT for finished ID
						var id = package._stamp + '_submit_before_emit';
						
						// EMIT Submit Before Emit
						emitter.emit(id);
						
						comet.actions[action_name].finished[id] = 'finished';
					}
				});
			},
			
			// ACTION EMIT preprocessor
			onEmit : function(package, request, response, mysql){
				var args 		= arguments;
				var id 	 		= package._stamp + '_submit_before_emit';
				var finished 	= comet.actions[action_name].finished[id];
				
				// APPEND package._next() to response.end() if necessary
				var end 		= response.end;
				response.end 	= function(){
					end.apply(this, arguments);
					if(isset(package._next)) { package._next(); }
				}
				
				if(isset(submit_before_emit)){
					if(finished == 'finished'){
						//console.log('*** ALREADY FINISHED', action_name);
						comet.actions[action_name]['functions'].onEmit.apply(this, args);
					} else {
						//console.log('*** WAIT FOR EMIT', action_name);
						emitter.on(id, function(){
							//console.log('*** WAIT FINISHED onEmit.apply()', action_name);
							comet.actions[action_name]['functions'].onEmit.apply(this, args);
						});
					}
				} else {
					//console.log('*** NO WAIT AT ALL ... FINISHED onEmit.apply()', action_name);
					comet.actions[action_name]['functions'].onEmit.apply(this, args);
					delete comet.actions[action_name].finished[id];
				}
			},
			
			// CUSTOM action functions holder
			functions : { onSubmit: false, onEmit: false }
		}
		
		return comet.actions[action_name]['functions'];
	}
	
	// CREATE client side path
	create_clint_side_path(COMET);
	
	// Comet Actions Emit Function Helper
	baseEmit = function(package, request, response, mysql){
		response.end(JSON.stringify(package));
		mysql.end();
	}
	
	comet.timeout 	 = 1000*60*60*24;
	comet.user_stack = [];
	comet.user_heap  = {};
	
	comet.emit = function(namespace, package){
		console.log(package.sender + ' --**--> ' + package.type + '_to_' + namespace);
		emitter.emit(package.type + '_to_' + namespace, package);
	}
		
	// Comet Listen Function
	comet.listen = function(type, request, response){
		//console.log('LISTEN: ' + type + '_to_' + request.comet_id);
		emitter.once(type + '_to_' + request.comet_id, cometListener);
	
		function cometListener(package){
			MySQL.connect(function(mysqlObject, error){
				// Create Custom MySQL Object for Comet Listen
				mysqlObject.error = error;
				var mysql_object = mysql_wrapper(request, response, mysqlObject);
				
				if(worker_state == 'enabled'){
					emitter.emit('worker_end_'+request.comet_id, package)
					worker_state = 'disabled';
				} else {
					comet.user_heap[request.comet_id].push(package);
				}
				
			});
		}		
	}
	
	// COMET CONTROLLER
	COMET.app.post.simple('/comet/controller', function(request, response){
		//console.log('## COMET/CONTROLLER OPENED!');
		
		// 1 Day Timeout
		request.connection.setTimeout(comet.timeout);
		response.setHeader('Connection', 'Keep-Alive');
		response.setHeader('Keep-Alive', 'timeout='+comet.timeout);
		
		// SET headers
		response.writeHead(200, {'Content-Type': 'text/javascript'});
		
		// GET comet ID
		request.cid 	 = request.query['cid'];
		COMET.id(request, response, false, function(ID){
			request.comet_id	= ID;
			
			// HANG UP for EXIT
			response.write('...');
			// LISTEN ON EXIT
			request.connection.on('close', function () {
				emitter.emit('exit', request.comet_id);
				clearInterval(request.comet_interval);
				response.end();
			});
			// HANG UP for EXIT
			request.comet_interval = setInterval(function(){ response.write('...'); }, 10000);
			
			// CREATE heap allocation for user
			comet.user_heap[request.comet_id] = [];
			
			var worker_state = 'enabled';
			emitter.removeAllListeners('worker_open_' + request.comet_id);
			
			// @ON OPEN worker connection
			emitter.addListener('worker_open_' + request.comet_id, function(options){
				
				if(comet.user_heap[request.comet_id].length == 0) {
					worker_state = 'enabled';
				} else {
					var package = comet.user_heap[request.comet_id].pop();
					MySQL.connect(function(mysqlObject, error){
						// Create Custom MySQL Object for Comet Listen
						mysqlObject.error = error;
						var mysql_object = mysql_wrapper(options.request, options.response, mysqlObject);
						
						package.private = (package.private) ? package.private : {} ;
						if(!isset(package.private.baseEmit)){
							delete package.private;
							// Run Function for Event
							comet.actions[package.type].onEmit(
								package, 
								options.request,  // worker request
								options.response, // worker response
								mysql_object
							);	
						} else {
							delete package.private;
							baseEmit(package, request, response, mysql_object);
						}
						
						if(comet.user_heap[request.comet_id].length == 0) {
							worker_state = 'enabled';
						} else {
							worker_state = 'disabled';
						}
						emitter.removeAllListeners('worker_end_'+request.comet_id);
					});
				}
			});	
			
			// UN-SUBSCRIBE from all event channels
			for(type in comet.actions){
				emitter.removeAllListeners(type + '_to_' + request.comet_id, cometListener);
			}
			
			// RE-SUBSCRIBE for all event channels
			for(type in comet.actions){
				console.log('***', request.cookies.sid +' SUBSCRIBED FOR ' + type + '_to_' + request.cookies.sid);
				emitter.addListener(type + '_to_' + request.comet_id, cometListener);
			}
			
			function cometListener(package){
				if(worker_state == 'enabled'){
					worker_state = 'disabled';
					emitter.emit('worker_end_'+request.comet_id, package);
					
				} else {
					comet.user_heap[request.comet_id].push(package);
				}
			}
		});
		
		
		
	}, false, true);
	
	// COMET WORKER
	COMET.app.post.simple('/comet/worker', function(request, response){
		// KEEP the connection OPEN
		request.connection.setTimeout(comet.timeout);
		response.setHeader('Connection', 'Keep-Alive');
		response.setHeader('Keep-Alive', 'timeout='+comet.timeout);
		response.setHeader('Content-Type', 'application/json');
		
		// SET headers
		response.writeHead(200, {'Content-Type': 'text/plain'});
		
		// GET comet ID
		request.cid 	 = request.query['cid'];
		COMET.id(request, response, false, function(comet_id){
			request.comet_id = comet_id;
			
			emitter.emit('worker_open_'+request.comet_id, {
				request: request, 
				response: response
			});
			
			//emitter.removeAllListeners('worker_end_'+request.comet_id);
			emitter.once('worker_end_'+request.comet_id, function(package){
				// Unsubscribe from all events
				// When an event is emitted only that event is removed
				// but all of the user events needs to be removed 
				emitter.removeAllListeners('worker_end_'+request.comet_id);
				MySQL.connect(function(mysqlObject, error){
					// Create Custom MySQL Object for Comet Listen
					mysqlObject.error = error;
					var mysql_object = mysql_wrapper(request, response, mysqlObject);
					
					package.private = (package.private) ? package.private : {} ;
					
					if(!isset(package.private.baseEmit)){
						delete package.private;
						// Run Function for Event
						comet.actions[package.type].onEmit(
							package, 
							request, 
							response, 
							mysql_object
						);	
					} else {
						delete package.private;
						baseEmit(package, request, response, mysql_object);
					}
				});
			});
		});
	
	}, false, true);

	// PUSH message
	COMET.app.post('/comet/push', function(request, response, mysql){
		// CREATE package from post body
		var package = JSON.parse(request.body.query.toString()); 
		
		// SET headers
		response.setHeader('Content-Type', 'application/json');
		
		// STAMP package with a unique identifier
		package._stamp 	= uniqid();
		request.cid 	= request.query['cid'];
		console.log(mysql);
		COMET.id(request, response, mysql, function(ID){
			package.sid	= ID;
			// Start Push Event
			comet.push(request, response, mysql, package, true);
		});
		
	});
	
	// Emit Message
	// Simple package emit which goes immediately to the listener client
	// without any actions on the server
	
	// !! this method requires all package contents to be prepared on the
	// sender's client side
	COMET.app.post('/comet/emit', function(request, response, mysql){
		// CREATE package from post body
		var package = JSON.parse(request.body.query.toString()); 
		
		// SET headers
		response.setHeader('Content-Type', 'application/json');
		
		// STAMP package with a unique identifier
		package._stamp = uniqid();
		request.cid    = request.query['cid'];
		
		COMET.id(request, response, mysql, function(ID){
			package.sid	= ID;
			
			// ADD noSubmit and baseEmit to the package
			if(isset(package.private)){
				package.private.noSubmit = true;
			} else {
				package.private = { noSubmit: true };
			}
			
			// Start Push Event
			comet.push(request, response, mysql, package, true);
		});
		
		
	});

	comet.push = function(request, response, mysql, package, automatic){ 
		// CONSTRUCT options
		var options = {
			request		: request,
			response	: response,
			mysql		: mysql,
			package		: package,
			automatic	: automatic,
			listeners	: false
		};
		
		// GET session user's informations
		COMET.sender(request, mysql, function(sender){
			// ASSIGN sender to package
		 	package.sender = sender;
				  
			// GET action object (onSubmit, onEmit)
			options.action = comet.actions[package.type];
			if(!isset(options.action)){
				throw new Error('Comet action ' + package.type + ' is NOT defined!');
			}
			
			// GET Private Variables
			if(isset(package.private)){
				options.private = package.private;
			} else {
				options.private = {};
			}
		
			// [ SINGLE LISTENER ] IF listener IS NOT AN Array
			if(typeof package.listener != 'object'){
				//request, response, mysql, action, package, private, false, automatic
				push_handler(options, false);
			
			// [ MULTI LISTENERS ] IF listener IS AN Array
			} else {
	
				var listener_count = package.listener.length;
				
				// FOREACH package.listener
				for(var i = 0; i < listener_count; i++){
					
					// Clean Options Object from the for Loop
					var clean_options = new hook(options, {});
					
					// GET listener instance from the array
					var listener = package.listener[i];
					
					// CREATE new package for this listener instance
					var listener_package = hook(package, {});
					
					// OVERWRITE package listener instance to the instance listener
					listener_package.listener = listener;
					
					// IF there are listener specific variables for any instance
					if(isset(listener_package.local)){
	
						// IF there are specific variables for this instance
						if(isset(package.local[listener])){
							listener_package.local = package.local[listener];
						} else {
							delete listener_package.local;
						}
	
					}
					
					clean_options.listener_count = { current: i, total: listener_count };
					clean_options.package = listener_package;
					
					// HANDLE push request for this listener instance
					push_handler(clean_options, true);
				}
			}
		});
	}
	
	function push_handler(options, multi_listener){
		//console.log('\n\nPUSH HANDLER', options.package.listener);
		// action, request, response, mysql, package, private, 
		// listener, EmitOnEnd, listener_count, automatic
		
		// Single Person
		if(!multi_listener){
			//console.log('// Single Person');
			comet.listeners['user'](options.request, options.package, options.mysql, options, 
			function(listener, options){
				options.EmitOnEnd = true;
				options.listener = listener;
				finishPush(options);
			});
		
		// A group of people
		} else {
			//console.log('GET A GROUP OF PEOPLE', options.package.listener);
			comet.listeners[options.package.listener](
				options.request, 
				options.package, 
				options.mysql, 
				options, 
			function(listeners, original_options, EmitOnEnd){
				if(!isset(EmitOnEnd)) { options.EmitOnEnd = false; }
				//if(!isset(listeners)) { options.EmitOnEnd = true; }
				//console.log('// A group of people for ' + options.package.listener,'=', listeners);
				
				options.package._next = new Next(listeners.length, function(){
					//console.log('\n=====','delete comet.actions[action_name].finished[id];','====\n')
					var id = options.package._stamp + '_submit_before_emit';
					delete comet.actions[options.package.type].finished[id];
				});
				
				listeners.forEach(function(listener_id){
					console.log('@@SENDER '+options.package.sid+' ##MESSAGES ', options.package.type + '_to_' + listener_id);
					emitter.emit(options.package.type + '_to_' + listener_id, options.package); 
				});
				finishPush(options);
			});
		}
		
	}
	
	// =======( Comet - Get Listeners )=======
	/*
		This part collects the users who should get the messages
	*/
	comet.listeners = {};
	comet.listener = function(listener_type, callback){
		comet.listeners[listener_type] = callback;
	};
	
	// =======( Comet - Push Handlers )=======
	comet.push_to = {};
	
	// Finishing Function of the Push Event
	function finishPush(options){ 
	
		//console.log('FINISH PUSH', options.package.listener);
		
		//	action, request, response, mysql, package, private, 
		//	listener, EmitOnEnd, listener_count, automatic
		
		var user_id 	= options.request.comet_id;
		var package 	= options.package;
		options.locals  = hook(options.listener, options.package);
		
		// EMIT push event for SINGLE listeners
		if(isset(options.EmitOnEnd)){
			if(isset(COMET.emitOnEndFilter)){
				COMET.emitOnEndFilter(user_id, options.mysql, options.package, emitter, options)
			} else {
				emitter.emit(package.type + '_to_' + package.listener, package); 
			}
		} 		
		//console.log('options.listener_count', isset(options.listener_count));

		if(isset(options.listener_count)){
			// Start onSubmit on start
			if(options.listener_count.current == 0){
				//console.log('//@ Start onSubmit on start'); 
				onSubmit(options); 
			}
			
			// END mysql on end
			if(options.listener_count.current == options.listener_count.total-1){ 
				//console.log('//@ END mysql on end', options.listener_count.current);
				options.request.finishedProcesses = true;
				close_connection(options.request, options.response, options.mysql);
			}
		} else {
			options.mysqlEnd = true;
			//console.log('RUN ONSUBMIT!!');
			onSubmit(options);
		}
	}
	
	// Possible Future Extension: actions.onSubmit[package.listener]();
	function onSubmit(options){
		// mysqlEnd, action, request, response, mysql, package, private, 
		// listener, EmitOnEnd, listener_count, automatic, locals
		if(!isset(options.private.noSubmit)){
			//console.log('listeners', options);
			options.action.onSubmit(
				options.mysql, 
				options.request, 
				options.response, 
				options.package, 
				options.private, 
				options.listener, 
			function(vars){
				
				options.vars = vars;
				onSubmitFinish(options);
			});
		} else {
			options.vars = null;
			onSubmitFinish(options);
		}	
	}
	
	function onSubmitFinish(options){
		//console.log('//% options.automatic', options.automatic)
		if(isset(options.vars)){ 
			options.package = hook(options.package, options.vars); 	
		}
		
		
		
		if(isset(options.automatic)){
			
			if(isset(options.listener_count)){
				options.request.finishedOnSubmit = true;
				options.request.finishedOnSubmitLocals = options.package;
				close_connection(options.request, options.response, options.mysql);
			}
			
			if(isset(options.mysqlEnd)){ 
				options.response.end(JSON.stringify(options.package));
				options.mysql.end(); 
			}
		} else {
			if(isset(options.private.onEnd)){ options.private.onEnd(); }
		}
	}
	
	function close_connection(request, response, mysql){
		if(request.finishedProcesses && request.finishedOnSubmit){
			response.end(JSON.stringify(request.finishedOnSubmitLocals));
			mysql.end();
		}
	}

	return comet;
}		