
all: clean compile start_server

start_server:
	node server.js

clean:
	rm built -r

compile:
	tsc
	sed -i "/import Drawflow from 'drawflow';/d" ./built/synth.js