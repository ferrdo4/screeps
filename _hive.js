let _Hive = {

    isPulse: function() {
        if (Game.cpu.bucket > 9000) {
            return Game.time % 5 == 0;
        } else if (Game.cpu.bucket > 7000) {
            return Game.time % 10 == 0;
        } else if (Game.cpu.bucket > 5000) {
            return Game.time % 15 == 0;
        } else if (Game.cpu.bucket > 3000) {
            return Game.time % 20 == 0;
        } else if (Game.cpu.bucket > 1000) {
            return Game.time % 30 == 0;
        } else if (Game.cpu.bucket <= 1000) {
            return Game.time % 45 == 0;
        }
    },

    moveReusePath: function() {
        if (Game.cpu.bucket > 9000) {
            return 5;
        } else if (Game.cpu.bucket > 7000) {
            return 10;
        } else if (Game.cpu.bucket > 5000) {
            return 15;
        } else if (Game.cpu.bucket > 3000) {
            return 20;
        } else if (Game.cpu.bucket > 1000) {
            return 30;
        } else if (Game.cpu.bucket <= 1000) {
            return 45;
        }
    },

    clearDeadMemory: function() {
        // Clear dead creeps from Memory
        for (let n in Memory.creeps) {
            if (!Game.creeps[n]) {
                delete Memory.creeps[n];
            }
        }
    },

    initMemory: function() {
        if (Memory["_rooms"] == null) Memory["_rooms"] = {};         
        if (Memory["_tasks"] == null) Memory["_tasks"] = {};
        
        // Populate empty room memories
        for (let r in Game["rooms"]) {            
            if (Memory["_rooms"][r] == null) Memory["_rooms"][r] = {};            
            if (Memory["_tasks"][r] == null) Memory["_tasks"][r] = {};            
        }

        // Set allies
        Memory["_allies"] = {   Pantek59: "",
								Atavus: "",
								BlackLotus: "",
								Moria: "",
								shedletsky: "" };

        Memory["_population_balance"] = {};  // Reset data for population balancing
        Memory["_spawn_requests"] = {};      // Reset all spawn requests
		
		if (Memory["request"] == null) Memory["request"] = {};
		if (Memory["options"] == null) Memory["options"] = { console: "on" };
    },    

    initTasks: function() {
        let _Tasks = require("_tasks");
        if (_Hive.isPulse()) {
			Memory["_tasks"] = {};
            for (let r in Game["rooms"]) {            
                Memory["_tasks"][r] = {};
                _Tasks.compileTasks(r);
            }
        }
    },
	
	processRequests: function() {
		// To be used for injecting tasks or terminal order requests
		if (Memory["request"] != null) {
			switch (Memory["request"]) {
				default:
					break;	

				case "log-storage": {
					let __Logs = require("__logs");
					__Logs.Storage();
					break;
				}
			}
		}
		
		Memory["request"] = null;
	},	
	
    populationTally: function(rmName, popTarget, popActual) {
        // Tallies the target population for a colony, to be used for spawn load balancing
        if (Memory["_population_balance"][rmName] == null) {
            Memory["_population_balance"][rmName] = {target: popTarget, actual: popActual, total: null};
        } else {
            Memory["_population_balance"][rmName]["target"] += popTarget;
            Memory["_population_balance"][rmName]["actual"] += popActual; 
        }
    },


    requestSpawn: function(rmName, spawnDistance, lvlPriority, tgtLevel, cBody, cName, cArgs) {
        /*  lvlPriority is an integer rating priority, e.g.:
                0: Defense (active, imminent danger)
                1: Mining operations (critical)
                2: Mining operations (regular)
                3: Colony operation (critical)
                4: Colony operation (regular)
                5: ... ? scouting? passive defense?
                
            tgtLevel is the target level of the creep"s body (per util.creep)
            spawnDistance is linear map distance from which a room (of equal or higher level) can spawn for this request
		*/

        let i = Object.keys(Memory["_spawn_requests"]).length;
        Memory["_spawn_requests"][i] = 
			{	room: rmName, distance: spawnDistance, priority: lvlPriority, 
				level: tgtLevel, body: cBody, name: cName, args: cArgs };
	},


    processSpawnRequests: function() {
        // Determine percentage each colony meets its target population
        for (let n in Memory["_population_balance"]) {            
            Memory["_population_balance"][n]["total"] = Memory["_population_balance"][n]["actual"] / Memory["_population_balance"][n]["target"];
        }

        let listRequests = Object.keys(Memory["_spawn_requests"]).sort((a, b) => { 
            return Memory["_spawn_requests"][a]["priority"] - Memory["_spawn_requests"][b]["priority"]; } );
        let listSpawns = Object.keys(Game["spawns"]).filter((a) => { return Game["spawns"][a].spawning == null; });
        let __Creep = require("__creep");

        for (let r in listRequests) {
            for (let s in listSpawns) {
                if (listSpawns[s] != null && listRequests[r] != null) {
					let spawn = Game["spawns"][listSpawns[s]];
                    let request = Memory["_spawn_requests"][listRequests[r]];
                    if (Game.map.getRoomLinearDistance(spawn.room.name, request.room) <= request.distance) {
                        let level = Math.max(1, Math.ceil(Memory["_population_balance"][request.room]["total"] 
                                * Math.min(request.level, _Hive.getRoom_Level(spawn.room.name))));
						let body = __Creep.getBody(request.body, level);
                        let result = spawn.createCreep(body, request.name, request.args);
						
                        if (_.isString(result)) {
							if (Memory["options"]["console"] == "on") {
								console.log(`<font color=\"#19C800\">Spawning</font> a lvl ${level} (of ${request.level}) `
									+ `${request.body} at ${spawn.room.name} (-> ${request.room})`);
							}
                            listSpawns[s] = null;
                            listRequests[r] = null;
                        }
                    }
                }
            }
        }
	},

    processSpawnRenewing: function() {
        let __Creep = require("__creep");
        let listSpawns = Object.keys(Game["spawns"]).filter((a) => { return Game["spawns"][a].spawning == null; });
        for (let s in listSpawns) {
            let spawn = Game["spawns"][listSpawns[s]];
            let creeps = spawn.pos.findInRange(FIND_MY_CREEPS, 1);
            for (let c in creeps) {
                if (!__Creep.isBoosted(creeps[c])) {
                    if (spawn.renewCreep(creeps[c]) == OK) {
                        break;
                    }
                }
            }
        }
    },


    getRoom_Level: function(rmName) {
        if (Game["rooms"][rmName].energyCapacityAvailable < 550)           // lvl 1, 300 energy
            return 1;
        else if (Game["rooms"][rmName].energyCapacityAvailable < 800)      // lvl 2, 550 energy
            return 2;
        else if (Game["rooms"][rmName].energyCapacityAvailable < 1300)     // lvl 3, 800 energy
            return 3;
        else if (Game["rooms"][rmName].energyCapacityAvailable < 1800)     // lvl 4, 1300 energy
            return 4;
        else if (Game["rooms"][rmName].energyCapacityAvailable < 2300)     // lvl 5, 1800 energy
            return 5;
        else if (Game["rooms"][rmName].energyCapacityAvailable < 5300)     // lvl 6, 2300 energy
            return 6;
        else if (Game["rooms"][rmName].energyCapacityAvailable < 12300)    // lvl 7, 5300 energy
            return 7;
        else if (Game["rooms"][rmName].energyCapacityAvailable == 12300)   // lvl 8, 12300 energy
            return 8;
		},
};

module.exports = _Hive;