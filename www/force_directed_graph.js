//Receive custom message from Shiny server.R
Shiny.addCustomMessageHandler("jsondata", function(message){
	
	//Parse the message (the JSON data string)
	var netdata = JSON.parse(message);

	//Specify pixel height and width for SVG element
	var width = 800;
	var height = 400;
	var padding = 20;

	//Specify a color scale
	var color = d3.scale.category20();
	
	//Specify start and end dates for time scale - note that January is 0 and December is 11
	var startdt = new Date(2016, 0, 1);
	var enddt = new Date(2016, 0, 31);

	//Set up the force directed graph layout
	var force = d3.layout.force()
		.charge(-700)
		.linkDistance(30)
		.size([width, height]);
		
	//Append SVG element to the network_graph div
	var netg = d3.select("#network_graph").append("svg")
		.attr("width", width)
		.attr("height", height);

	//Create tooltips to display on hover
	var tooltip = d3.select("body")
		.append("div")
		.style("position", "absolute")
		.style("z-index", "10")
		.style("visibility", "hidden")
		.style("color", "white")
		.style("padding", "8px")
		.style("background-color", "rgba(0, 0, 0, 0.75)")
		.style("border-radius", "6px")
		.style("font", "12px sans-serif")
		.text("tooltip");
		
	//Create time scale that translates start date to left of screen and end date to right
	var xscale = d3.time.scale()
		.domain([startdt, enddt])
		.range([padding, width - 6*padding])
		.clamp(true);

	//Define the x-axis (the time scale)
	var xAxis = d3.svg.axis()
		.scale(xscale)
		.tickSize(0)
		.tickPadding(20);
		
	//Establish date range for dataset
	function getDate(d) {
		return d3.time.format("%d-%m-%Y").parse(d);
	}
	
	//Create a scale for node size since it will be based on centrality
	var nodeRScale = d3.scale.linear().range([2.5, 4.5]);
		
	//Create the graph data structure out of the JSON data
	force.nodes(netdata.nodes)
		.links(netdata.links)
		.start();

	//Create all the links (the line SVGs), but without locations specified for drawing them yet
	var link = netg.selectAll(".link")
		.data(netdata.links)
		.enter().append("line")
		.attr("class", "all_links")
		//Make the link thickness a function of the link weight_ct (the weight of a connection based on count of trxns)
		.style("stroke-width", function (d) {
			return d.weight_ct;
		});

	//Create all the nodes (the circle SVGs), but without locations specified for drawing them yet
	var node = netg.selectAll(".node")
		.data(netdata.nodes)
		.enter().append("circle")
		.attr("class", "all_nodes")
		//.attr("r", 9)
		.attr("r", function(d) {
			return nodeRScale(d.centrality);
		})
		//Make the node color a function of the node's group (the node's cluster)
		.style("fill", function (d) {
			return color(d.group);
		})
		.call(force.drag)
		.on("mouseover", function(d) { 
			tooltip.text(d.name);
			tooltip.style("visibility", "visible");
		})
		.on("mousemove", function() {
			return tooltip.style("top", (d3.event.pageY-10)+"px").style("left",(d3.event.pageX+10)+"px");
		})
		.on("mouseout",  function() { 
			return tooltip.style("visibility", "hidden");
		})
		.on('dblclick', connectedNodes);  //Implements focus on double-clicked node's network (connectedNodes function)

	//SVG brush is an element that allows the user to click/drag to select something
	var brush = d3.svg.brush()
		.x(xscale)
		.extent([startdt, enddt])
		.on("brush", brushed);
	
	//Append an SVG element for the brush/time slider, create SVG axis, append slider element
	var slidercontainer = netg.append("g")
		.attr("transform", "translate(100, 350)");
	var axis = slidercontainer.append("g")
		.call(xAxis);	
	var slider = slidercontainer.append("g")
		.call(brush)
		.classed("slider", true);
		
	//Append slider handles (circles at the ends of the slider)
	d3.selectAll(".resize").append("circle")
		.attr("cx", 0)
		.attr("cy", 0)
		.attr("r", 10)
		.attr("fill", "Red")
		.classed("handle", true);
			
	//Use the force layout to calculate the coordinates for all for all of the SVG elements (circles and lines)
	force.on("tick", function () {
		link.attr("x1", function (d) {
				return d.source.x;
			})
			.attr("y1", function (d) {
				return d.source.y;
			})
			.attr("x2", function (d) {
				return d.target.x;
			})
			.attr("y2", function (d) {
				return d.target.y;
			});
		node.attr("cx", function (d) {
				return d.x;
			})
			.attr("cy", function (d) {
				return d.y;
			});
	});
	node.each(collide(0.5));  //Implements anti-overlapping of the circles (the collide function)
	
	//Define brushed function to add and remove links based on what the user selects in the brush element
	function brushed() {
		link.style("stroke-opacity", function(d) {
		   return getDate(d.event_date) > brush.extent()[1] ? 0 : 0.7;
		 });
		force.start();
	}
		
	/*-------Function from here down are auxiliary-------*/

	//Create a function to prevent nodes from overlapping by separating the circles with padding
	var padding = 1;
	var radius=8;
	function collide(alpha) {
		var quadtree = d3.geom.quadtree(netdata.nodes);
		return function(d) {
			var rb = 2*radius + padding;
			var nx1 = d.x - rb;
			var nx2 = d.x + rb;
			var	ny1 = d.y - rb;
			var	ny2 = d.y + rb;
			quadtree.visit(function(quad, x1, y1, x2, y2) {
				if (quad.point && (quad.point !== d)) {
					var x = d.x - quad.point.x;
					var y = d.y - quad.point.y;
					var l = Math.sqrt(x * x + y * y);
					if (l < rb) {
						l = (l - rb) / l * alpha;
						d.x -= x *= l;
						d.y -= y *= l;
						quad.point.x += x;
						quad.point.y += y;
					}
				}
			  return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
			});
		};
	}

	/*The next code block makes it so that double-clicking shows only the clicked node's network*/
	//Toggle stores whether a node has been double-clicked
	var toggle = 0;
	//Create an array to log which nodes are connected to which other nodes
	var linkedByIndex = {};
	for (i = 0; i < netdata.nodes.length; i++) {
		linkedByIndex[i + "," + i] = 1;
	};
	netdata.links.forEach(function (d) {
		linkedByIndex[d.source.index + "," + d.target.index] = 1;
	});
	//This function looks up whether a pair are neighbors
	function neighboring(a, b) {
		return linkedByIndex[a.index + "," + b.index];
	}
	function connectedNodes() {
		if (toggle == 0) {
			//Reduce the opacity of all but the neighboring nodes
			d = d3.select(this).node().__data__;
			node.style("opacity", function (o) {
				return neighboring(d, o) | neighboring(o, d) ? 1 : 0.1;
			});
			link.style("opacity", function (o) {
				return d.index==o.source.index | d.index==o.target.index ? 1 : 0.1;
			});
			toggle = 1;
		} else {
			//Put them back to opacity=1
			node.style("opacity", 1);
			link.style("opacity", 1);
			toggle = 0;
		}
	}
});