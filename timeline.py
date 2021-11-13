import pydot

def draw_graph(filename):
    graphs = pydot.graph_from_dot_file(filename + ".dot")
    graph = graphs[0]
    graph.write_png(filename + ".png")

def main():
    draw_graph("timeline")
    draw_graph("timeline2")
    draw_graph("fm_timeline")

if __name__ == "__main__":
    main()

