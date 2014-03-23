function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continue(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continue(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var r=Math.random();
    var value;
    if(r<0.7){
      value=[2];
    }else if(r<0.82){
      value=[4];
    }else if(r<0.94){
      value=[2,4];
    }else{
      value=[2,8];
    }
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  try{
    this.grid.cells[tile.x][tile.y] = null;
    this.grid.cells[cell.x][cell.y] = tile;
    tile.updatePosition(cell);
  }catch(e){
    debugger;
  }
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  if(vector.x){
    traversals.y.forEach(function (y) {
      //全パターンを列挙
      var pats=allPatterns(vector,{x:0,y:y});
      var paos=pats.map(function(pattern){return pattern.concat([]);});
      pats=processPatterns(pats,traversals.x,vector.x);
      setTiles(paos,pats,vector,traversals.x,traversals.x.map(function(idx){return {x:idx,y:y}}));
    });
  }else{
    traversals.x.forEach(function (x) {
      var pats=allPatterns(vector,{x:x,y:0});
      var paos=pats.map(function(pattern){return pattern.concat([]);});
      pats=processPatterns(pats,traversals.y,vector.y);
      setTiles(paos,pats,vector,traversals.y,traversals.y.map(function(idx){return {x:x,y:idx}}));
    });
  }
  function allPatterns(vector,cell){
    vector={
      x:Math.abs(vector.x),
      y:Math.abs(vector.y),
    };
    if(!self.grid.withinBounds(cell)){
      return [[]];
    }
    var tile=self.grid.cellContent(cell);
    var value=tile ? tile.value : [null];
    var result=[];
    //return value.map(function(v){
    value.forEach(function(v){
      result=result.concat(allPatterns(vector,{x:cell.x+vector.x,y:cell.y+vector.y}).map(function(pattern){
        return [v].concat(pattern);
      }));
    });
    return result;
  }
  function processPatterns(pats,traversal,vector){
    var moveds=pats.map(function(pattern){
      return processPattern(traversal,vector,pattern);
    });
    if(moveds.some(function(arr){return arr[1]})){
      //mergedなものがあったら動かなかったものは除去
      pats=pats.filter(function(pattern,i){
        return !!moveds[i][1];
      });
    }
    moved = moved || moveds.some(function(arr){return arr[0]||arr[1]});
    return pats;
  }
  function processPattern(traversal,vector,pattern){
    var merged=[];
    var moved= traversal.reduce(function(prev,idx){
      return processTile(pattern,merged,vector,idx) || prev;
    },false);
    return [moved,merged.some(function(x){return x})];
  }
  function processTile(pattern,merged,vector,idx){
    var moved=false;
    //vector: 1d
    var value=pattern[idx];
    var farthest,nextpos;
    if(value!=null){
      nextpos=idx;
      do{
        farthest=nextpos;
        nextpos=farthest+vector;
      }while(pattern[nextpos]===null);
      var next=pattern[nextpos];
      if(next!=null && value===next && !merged[nextpos]){
        //merge
        pattern[nextpos]=value*2;
        merged[nextpos]=true
        pattern[idx]=null;
        merged[idx]=false;
        self.score+=value*2;
      }else if(idx!=farthest){
        //タイル移動
        pattern[farthest]=value;
        merged[farthest]=merged[idx];
        pattern[idx]=null;
        merged[idx]=false;
        moved=true;
      }
    }
    return moved;
    /*
    cell = { x: x, y: y };
    tile = self.grid.cellContent(cell);

    if (tile) {
      var positions = self.findFarthestPosition(cell, vector);
      var next      = self.grid.cellContent(positions.next);

      // Only one merger per row traversal?
      if (next && next.value[0] === tile.value[0] && !next.mergedFrom) {
        var merged = new Tile(positions.next, [tile.value[0] * 2]);
        merged.mergedFrom = [tile, next];

        self.grid.insertTile(merged);
        self.grid.removeTile(tile);

        // Converge the two tiles' positions
        tile.updatePosition(positions.next);

        // Update the score
        self.score += merged.value[0];

        // The mighty 2048 tile
        if (merged.value === 2048) self.won = true;
      } else {
        self.moveTile(tile, positions.farthest);
      }

      if (!self.positionsEqual(cell, tile)) {
        moved = true; // The tile moved from its original cell!
      }
    }*/
  }
  function setTiles(paos,pats,vector,traversal,cells){
    console.log(JSON.stringify(paos),JSON.stringify(pats));
    var bef=[],aft=[];
    traversal.forEach(function(idx){
      bef.push(collect(paos,idx));
      aft.push(collect(pats,idx));
    });
    //how many times merged
    var diff=actualLength(bef)-actualLength(aft);
    var i=0,j=0;    //i:aft,j:bef
    while(bef[j] && bef[j].length===0)j++;
    while(i<self.size){
      var cell=cells[j];
      var acell=cells[i];
      var bval=bef[j];
      var aval=aft[i];
      if(aval.length===0){
        //もうない
        break;
      }
      if(!eq(bval,aval)){
        if(diff>0){
          //これがマージされたことにする
          console.log("merge");
          var merged=new Tile(acell,aval);
          var from1=self.grid.cellContent(cell);
          bef[j]=[];
          nextj();  //acell
          bef[j]=[];
          var from2=self.grid.cellContent(cells[j]);
          diff--;
          merged.mergedFrom=[from1,from2];
          self.grid.removeTile(from1); //?
          self.grid.removeTile(from2);
          self.grid.insertTile(merged);
          from1.updatePosition(acell);
          from2.updatePosition(acell);
          //完了
          if(merged.value.indexOf(2048)>=0){
            self.won=true;
          }
        }else{
          //動いた?
          var tile=self.grid.cellContent(cell);
          self.moveTile(tile,acell);
          tile.value=aval;
        }
      }else if(i!==j){
        //変わってないけど動いた
        //debugger;
        var tile=self.grid.cellContent(cell);
        self.moveTile(tile,acell);
      }
      i++;
      nextj();
    }

    function nextj(){
      do{
        j++;
      }while(bef[j] && bef[j].length===0);
    }

    
    //端によっているので
    function actualLength(arr){
      var result=0;
      for(var i=0;i<arr.length;i++){
        if(arr[i].length>0){
          result++;
        }
      }
      return result;
    }
    //収集する
    function collect(pats,idx){
      //重複なし
      var result=[];
      var table={};
      pats.forEach(function(pattern){
        if(pattern[idx]==null)return;
        if(table[pattern[idx]]!==true){
          result.push(pattern[idx]);
          table[pattern[idx]]=true;
        }
      });
      return result.sort(function(a,b){return a-b});
    }
    //arrayが同じかどうか
    function eq(arr1,arr2){
      if(arr1.length!==arr2.length)return false;
      return arr1.every(function(val,i){
        return val===arr2[i];
      });
    }
  }

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          /*if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }*/
          if(other && tile.value.some(function(v){
            return other.value.indexOf(v)>=0;
          })){
            return true;
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

