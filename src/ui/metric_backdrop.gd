extends ColorRect
## Decorative background only, no input or state. Rounded at physical UI size.
var base_color := Color("#236fba")
const SHADER := "shader_type canvas_item; uniform vec4 base_color : source_color; uniform vec2 rect_size; void fragment(){vec2 p=UV*rect_size; float r=18.0; vec2 q=abs(p-rect_size*0.5)-(rect_size*0.5-vec2(r)); float d=length(max(q,vec2(0.0)))+min(max(q.x,q.y),0.0)-r; float a=1.0-smoothstep(-1.0,0.5,d); vec3 c=mix(base_color.rgb, min(base_color.rgb+vec3(0.07),vec3(1.0)),UV.x); float ring=abs(length(p-vec2(rect_size.x-28.0,rect_size.y-12.0))-60.0); c=mix(c,vec3(1.0),(1.0-smoothstep(11.0,12.0,ring))*0.06); COLOR=vec4(c,a);}"

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var shader := Shader.new()
	shader.code = SHADER
	var shader_material := ShaderMaterial.new()
	shader_material.shader = shader
	shader_material.set_shader_parameter("base_color", base_color)
	material = shader_material
	resized.connect(_resize_shader)
	_resize_shader()

func _resize_shader() -> void:
	if material != null:
		material.set_shader_parameter("rect_size", size)
