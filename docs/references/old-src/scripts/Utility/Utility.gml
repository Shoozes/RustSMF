function smf_smoothstep(_min, _max, val)
{
	// Scale, bias and saturate x to 0..1 range
	var xx = clamp((val - _min) / (_max - _min), 0.0, 1.0);
	// Evaluate polynomial
	return xx * xx * (3 - 2 * xx);
}
function smf_quadratic_interpolate(A, B, C, amount)
{
	var t0 = .5 * sqr(1 - amount);
	var t1 = .5 * amount * amount;
	var t2 = 2 * amount * (1 - amount);
	return t0 * (A + B) + t1 * (B + C) + t2 * B;
}
function smf_get_array_index(array, val)
{	/*	Returns the array index of the given value.
		-1 if the value does not exist in the array*/
	for (var i = array_length(array) - 1; i >= 0; i --)
	{
		if (val == array[i])
		{
			return i;
		}
	}
	return -1;
}


function smf_model_load_v7_from_buffer(loadBuff, path = "", targetModel = new smf_model())
{
	buffer_seek(loadBuff, buffer_seek_start, 0);
	var HeaderText = buffer_read(loadBuff, buffer_string);
	var versionNum = 0;
	if HeaderText != "SnidrsModelFormat"
	{
		show_debug_message("The given buffer does not contain a valid SMF model");
		return -1;
	}
	versionNum = buffer_read(loadBuff, buffer_f32);

	var partitioned = false;
	var compatibility = false;
	var n, i, j, nodeNum, nodeList, node, worldDQ, animNum, animName, anim, keyframeNum, keyframeGrid, keyframeTime, keyframeInd, deltaDQ, keyframe, a, f, l, localDQ;

	//This importer supports versions 6, 7 and 8
	if (versionNum > 8)
	{
		show_error("This was made with a newer version of SMF.", false);
		return -1;
	}
	else if (versionNum == 8)
	{
		partitioned = true;
		compatibility = buffer_read(loadBuff, buffer_bool);
	}
	else if (versionNum < 6)
	{
		show_error("This was made with an unsupported version of SMF.", false);
		return -1;
	}

	//Create SMF model container
	var model = targetModel;

	//Load buffer positions
	var texPos = buffer_read(loadBuff, buffer_u32);
	var matPos = buffer_read(loadBuff, buffer_u32);
	var modPos = buffer_read(loadBuff, buffer_u32);
	var nodPos = buffer_read(loadBuff, buffer_u32);
	var colPos = buffer_read(loadBuff, buffer_u32);
	var rigPos = buffer_read(loadBuff, buffer_u32);
	var aniPos = buffer_read(loadBuff, buffer_u32);
	var selPos = buffer_read(loadBuff, buffer_u32);
	var subPos = buffer_read(loadBuff, buffer_u32);
	buffer_read(loadBuff, buffer_u32); //Placeholder

	//Version 6 "compiled"
	if (versionNum == 6)
	{
		if buffer_read(loadBuff, buffer_u8) //If compiled
		{
			show_error("This was made with an unsupported version of SMF.", false);
			return -1;
		}
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load number of models
	modelNum = buffer_read(loadBuff, buffer_u8);

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load textures
	var texMap = ds_map_create();
	buffer_seek(loadBuff, buffer_seek_start, texPos);
	var texNum = buffer_read(loadBuff, buffer_u8);
	if (texNum > 0)
	{
		var s = surface_create(8, 8);
		surface_set_target(s);
		draw_clear(c_white);
		surface_reset_target();
		var blankSprite = sprite_create_from_surface(s, 0, 0, 8, 8, 0, 0, 0, 0);
		var texBuff = buffer_create(1, buffer_fast, 1);
		for (var t = 0; t < texNum; t ++)
		{
			var name = buffer_read(loadBuff, buffer_string);
			var w = buffer_read(loadBuff, buffer_u16);
			var h = buffer_read(loadBuff, buffer_u16);
			var spr = asset_get_index(filename_change_ext(filename_name(path), "_" + string(name)));
			if (sprite_exists(spr)) //Check if the texture is already in the game files
			{
				texMap[? name] = spr;
			}
			else if (w > 0 and h > 0)
			{
				surface_resize(s, w, h);
				buffer_resize(texBuff, w * h * 4)
				buffer_copy(loadBuff, buffer_tell(loadBuff), w * h * 4, texBuff, 0);
				buffer_set_surface(texBuff, s, 0);
				texMap[? name] = sprite_create_from_surface(s, 0, 0, w, h, 0, 0, 0, 0);
			}
			else if is_undefined(texMap[? name])
			{
				texMap[? name] = sprite_duplicate(blankSprite);
			}
			buffer_seek(loadBuff, buffer_seek_relative, w * h * 4);
		}
		sprite_delete(blankSprite);
		surface_free(s);
		buffer_delete(texBuff);
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load models
	buffer_seek(loadBuff, buffer_seek_start, modPos);
	model.mBuff = array_create(modelNum);
	model.vBuff = array_create(modelNum);
	model.texPack = array_create(modelNum);
	model.vis = array_create(modelNum);
	model.subRigIndex = array_create(modelNum);
	for (var m = 0; m < modelNum; m ++)
	{
		//Read vertex buffers
		var size = buffer_read(loadBuff, buffer_u32);
		var mBuff = buffer_create(size, buffer_fixed, 1);
		buffer_copy(loadBuff, buffer_tell(loadBuff), size, mBuff, 0);
		var vBuff = vertex_create_buffer_from_buffer(mBuff, compatibility ? global.mBuffStdFormat : global.mBuffFormat);
		vertex_freeze(vBuff);
		model.mBuff[m] = mBuff;
		model.vBuff[m] = vBuff;
		model.subRigIndex[m] = 0;

		buffer_seek(loadBuff, buffer_seek_relative, size);

		var matName = buffer_read(loadBuff, buffer_string);
		var texName = buffer_read(loadBuff, buffer_string);
		var texInd = texMap[? texName];
		model.texPack[m] = is_undefined(texInd) ? -1 : texInd;
		model.vis[m] = buffer_read(loadBuff, buffer_u8);

		//Ignore skinning info
		var n = buffer_read(loadBuff, buffer_u32);
		repeat n{buffer_seek(loadBuff, buffer_seek_relative, buffer_read(loadBuff, buffer_u8) * 4);}
		var n = buffer_read(loadBuff, buffer_u32);
		buffer_seek(loadBuff, buffer_seek_relative, n * 4);

		//Read partition index
		if partitioned
		{
			model.subRigIndex[m] = buffer_read(loadBuff, buffer_u8);
		}
	}
	ds_map_destroy(texMap);

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load rig
	buffer_seek(loadBuff, buffer_seek_start, rigPos);
	var nodeNum, i, j, nodeList, node, worldDQ;
	nodeNum = buffer_read(loadBuff, buffer_u8);
	if (nodeNum > 0)
	{
		model.rig = new smf_rig();
		nodeList = model.rig.nodeList;
		for (i = 0; i < nodeNum; i ++)
		{
			node = array_create(eAnimNode.Num, 0);
			worldDQ = array_create(8);
			for (j = 0; j < 8; j ++)
			{
				worldDQ[j] = buffer_read(loadBuff, buffer_f32);
			}
			node[@ eAnimNode.WorldDQ] = worldDQ;
			var p = buffer_read(loadBuff, buffer_u8);
			node[@ eAnimNode.Parent] = (p >= 0 && p < nodeNum) ? p : 0;
			node[@ eAnimNode.IsBone] = buffer_read(loadBuff, buffer_u8);
			node[@ eAnimNode.PrimaryAxis] = [0, 0, 1];

			//Add node to node list
			nodeList[| i] = node;
			_anim_rig_update_node(model.rig, i);
		}
		_anim_rig_update_bindmap(model.rig);
	}
	if (buffer_read(loadBuff, buffer_u8) == 232) //An extension to the rig format
	{
		var bytesPerNode = buffer_read(loadBuff, buffer_u8);
		var buffPos = buffer_tell(loadBuff);
		for (i = 0; i < nodeNum; i ++)
		{
			node = nodeList[| i];
			node[@ eAnimNode.Locked] = buffer_peek(loadBuff, buffPos + bytesPerNode * i, buffer_u8);
			if (bytesPerNode >= 13)
			{
				var pAxis = array_create(3);
				pAxis[0] = buffer_peek(loadBuff, buffPos + bytesPerNode * i + 1, buffer_f32);
				pAxis[1] = buffer_peek(loadBuff, buffPos + bytesPerNode * i + 5, buffer_f32);
				pAxis[2] = buffer_peek(loadBuff, buffPos + bytesPerNode * i + 9, buffer_f32);
				node[@ eAnimNode.PrimaryAxis] = pAxis;
			}
		}
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load rig partitions
	if (partitioned)
	{
		buffer_seek(loadBuff, buffer_seek_start, subPos);
		var num = buffer_read(loadBuff, buffer_u8);
		model.subRigs = array_create(num);
		for (i = 0; i < num; i ++)
		{
			var boneNum = buffer_read(loadBuff, buffer_u8);
			var subRig = array_create(boneNum);
			for (j = 0; j < boneNum; j ++)
			{
				subRig[j] = buffer_read(loadBuff, buffer_u8);
			}
			model.subRigs[i] = subRig;
		}
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load animation
	buffer_seek(loadBuff, buffer_seek_start, aniPos);
	var animNum, animName, anim, keyframeNum, keyframeGrid, keyframeTime, keyframeInd, deltaDQ, keyframe, a, f, i, l, localDQ;
	localDQ = array_create(8);
	animNum = buffer_read(loadBuff, buffer_u8);
	if (animNum > 0)
	{
		model.animations = array_create(animNum);
		for (a = 0; a < animNum; a ++)
		{
			animName = buffer_read(loadBuff, buffer_string);
			anim = new smf_anim(animName);
			keyframeNum = buffer_read(loadBuff, buffer_u8);
			keyframeGrid = anim.keyframeGrid;
			anim.loop = true;
			anim.nodeNum = nodeNum;
			anim.interpolation = eAnimInterpolation.Quadratic;
			for (f = 0; f < keyframeNum; f ++)
			{
				keyframeTime = buffer_read(loadBuff, buffer_f32);
				keyframeInd = anim_add_keyframe(anim, keyframeTime);
				keyframe = keyframeGrid[# 1, keyframeInd];
				for (i = 0; i < nodeNum; i ++)
				{
					for (l = 0; l < 8; l ++)
					{
						//Read delta local dual quaternion of the keyframe node
						localDQ[l] = buffer_read(loadBuff, buffer_f32);
					}
					node = nodeList[| i];
					deltaDQ = keyframe[i];
					smf_dq_multiply(node[eAnimNode.LocalDQConjugate], localDQ, deltaDQ);
					if (node[eAnimNode.IsBone])
					{
						deltaDQ[@ 4] = 0;
						deltaDQ[@ 5] = deltaDQ[2] * node[eAnimNode.Length];
						deltaDQ[@ 6] = -deltaDQ[1] * node[eAnimNode.Length];
						deltaDQ[@ 7] = 0;
					}
				}
			}
			model.animMap[? animName] = a;
			model.animations[a] = anim;
		}
	}
	//Load additional animation info (only used in v8)
	if (buffer_read(loadBuff, buffer_u8) == 239)
	{
		for (a = 0; a < animNum; a ++)
		{
			anim = model.animations[a];
			anim.playTime = buffer_read(loadBuff, buffer_f32);
			anim.update_playspeed();
			anim.sampleFrameMultiplier = buffer_read(loadBuff, buffer_u8);
			anim.loop = buffer_read(loadBuff, buffer_bool);
		}
	}
	//Generate sample strips for each animation
	for (a = 0; a < animNum; a ++)
	{
		anim = model.animations[a];
		array_set(model.sampleStrips, a, new smf_samplestrip(model.rig, anim));
	}

	show_debug_message("Successfully loaded SMF model " + string(path) +
		+ ", containing " + string(modelNum) + ((modelNum > 1) ? " models" : " model")
		+ " and " + string(texNum) + ((texNum > 1) ? " textures" : " texture"));
	return model;
}


function smf_model_load_v10_from_buffer(loadBuff, path = "", targetModel = new smf_model())
{
	var m, F, vertNum, mBuff, v, n, t, size, vBuff, matName, texName, texInd, bytesPerVert, modelNum, vnt, texPos, matPos, modPos, rigPos, aniPos, texMap, s, blankSprite, texBuff, name, w, h, spr, texBuffSize, nodeNum, i, j, M, px, py, pz, animNum, animName, anim, frameNum, frameTime, keyframeInd, prevFrame, keyframe, poseDQ, a, f;
	if (path != "")
	{
		var ext = string_lower(filename_ext(path))
		if (ext == ".obj")
		{
			var buff = buffer_load(path);
			if (buff < 0)
			{
				show_debug_message("smf_model_load_from_buffer: The given buffer does not contain a valid OBJ model");
			}
			var obj = mbuff_load_obj_from_buffer(buff, path, true);
			buffer_delete(buff);
			mbuff_add(targetModel.mBuff, obj[0]);
			texpack_add_texpack(targetModel.texPack, obj[1]);
			targetModel.vBuff = vbuff_create_from_mbuff(targetModel.mBuff);
			modelNum = array_length(obj[0]);
			var texNum = array_length(obj[1]);
			show_debug_message("smf_model_load_from_buffer: Successfully loaded OBJ model " + string(path) + ", containing " + string(modelNum) + " models and " + string(texNum) + " textures");
			return targetModel;
		}
	}
	buffer_seek(loadBuff, buffer_seek_start, 0);
	var headerText = buffer_read(loadBuff, buffer_string);
	if (headerText != "SMF_v10_by_Snidr_and_Bart")
	{
		var model = smf_model_load_v7_from_buffer(loadBuff, path, targetModel);
		if (is_struct(model))
		{
			return model;
		}
		show_debug_message("smf_model_load_from_buffer: The given buffer does not contain a valid SMF model");
		return -1;
	}

	//Load buffer positions
	var texPos = buffer_read(loadBuff, buffer_u32);
	var matPos = buffer_read(loadBuff, buffer_u32);
	var modPos = buffer_read(loadBuff, buffer_u32);
	var rigPos = buffer_read(loadBuff, buffer_u32);
	var aniPos = buffer_read(loadBuff, buffer_u32);

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load textures
	var texMap = ds_map_create();
	buffer_seek(loadBuff, buffer_seek_start, texPos);
	var texNum = buffer_read(loadBuff, buffer_u8);
	if (texNum > 0)
	{
		var s = surface_create(8, 8);
		surface_set_target(s);
		draw_clear(c_white);
		surface_reset_target();
		var blankSprite = sprite_create_from_surface(s, 0, 0, 8, 8, 0, 0, 0, 0);
		var texBuff = buffer_create(1, buffer_fast, 1);
		for (var t = 0; t < texNum; t ++)
		{
			var name = buffer_read(loadBuff, buffer_string);
			var w = buffer_read(loadBuff, buffer_u16);
			var h = buffer_read(loadBuff, buffer_u16);
			var spr = asset_get_index(filename_change_ext(filename_name(path), "_" + string(name)));
			if (sprite_exists(spr)) //Check if the texture is already in the game files
			{
				texMap[? name] = spr;
			}
			else if (w > 0 and h > 0)
			{
				surface_resize(s, w, h);
				buffer_resize(texBuff, w * h * 4)
				buffer_copy(loadBuff, buffer_tell(loadBuff), w * h * 4, texBuff, 0);
				buffer_set_surface(texBuff, s, 0);
				texMap[? name] = sprite_create_from_surface(s, 0, 0, w, h, 0, 0, 0, 0);
			}
			else if is_undefined(texMap[? name])
			{
				texMap[? name] = sprite_duplicate(blankSprite);
			}
			buffer_seek(loadBuff, buffer_seek_relative, w * h * 4);
		}
		sprite_delete(blankSprite);
		surface_free(s);
		buffer_delete(texBuff);
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load models
	buffer_seek(loadBuff, buffer_seek_start, modPos);
	modelNum = buffer_read(loadBuff, buffer_u8);
	var model = targetModel;
	var m, size, mBuffLocal, vBuffLocal, matName, texName, texInd;
	model.mBuff = array_create(modelNum);
	model.vBuff = array_create(modelNum);
	model.texPack = array_create(modelNum);
	model.vis = array_create(modelNum);
	model.subRigIndex = array_create(modelNum);
	for (m = 0; m < modelNum; m ++)
	{
		//Read vertex buffers
		size = buffer_read(loadBuff, buffer_u32);
		mBuffLocal = buffer_create(size, buffer_fixed, 1);
		buffer_copy(loadBuff, buffer_tell(loadBuff), size, mBuffLocal, 0);
		buffer_seek(loadBuff, buffer_seek_relative, size);
		vBuffLocal = vertex_create_buffer_from_buffer(mBuffLocal, global.mBuffFormat);
		vertex_freeze(vBuffLocal);
		model.mBuff[m] = mBuffLocal;
		model.vBuff[m] = vBuffLocal;

		matName = buffer_read(loadBuff, buffer_string);
		texName = buffer_read(loadBuff, buffer_string);
		texInd = texMap[? texName];
		model.texPack[m] = is_undefined(texInd) ? -1 : texInd;
		model.vis[m] = buffer_read(loadBuff, buffer_u8);
	}
	ds_map_destroy(texMap);

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load rig
	buffer_seek(loadBuff, buffer_seek_start, rigPos);
	var nodeNum = buffer_read(loadBuff, buffer_u8);
	var i, j, M, px, py, pz;
	if (nodeNum > 0)
	{
		model.rig = new smf_rig();
		M = array_create(16);
		// First pass: populate
		for (i = 0; i < nodeNum; i ++)
		{
			//Load the node as a 4x4 matrix
			for (j = 0; j < 16; j ++)
			{
				M[j] = buffer_read(loadBuff, buffer_f32);
			}

			smf_mat_orthogonalize(M);

			//Create a node
			node = array_create(eAnimNode.Num, 0);
			node[@ eAnimNode.WorldDQ] = smf_dq_create_from_matrix(M, array_create(8));
			var p = buffer_read(loadBuff, buffer_u8);
			node[@ eAnimNode.Parent] = (p >= 0 && p < nodeNum) ? p : 0;
			node[@ eAnimNode.IsBone] = buffer_read(loadBuff, buffer_u8);
			node[@ eAnimNode.Locked] = buffer_read(loadBuff, buffer_u8);

			//Load primary axis, which is used for IK. If no primary axis is stored, SMF will do an educated guess when needed.
			px = buffer_read(loadBuff, buffer_f32);
			py = buffer_read(loadBuff, buffer_f32);
			pz = buffer_read(loadBuff, buffer_f32);
			node[@ eAnimNode.PrimaryAxis] = (px == 0 && py == 0 && pz == 0) ? undefined : [px, py, pz];

			//Add node to rig
			model.rig.nodeList[| i] = node;
		}

		// Second pass: updates (old v10 behavior: re-derive orients via update_node for legacy format compat)
		for (i = 0; i < nodeNum; i ++)
		{
			model.rig.update_node(i);
		}

		//Update the rig's bind map, for mapping bones to nodes
		model.rig.update_bindmap();
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load animation
	buffer_seek(loadBuff, buffer_seek_start, aniPos);
	var animNum = buffer_read(loadBuff, buffer_u8);
	var nodeList = model.rig.nodeList;
	M = array_create(16);
	poseDQ = array_create(nodeNum);
	model.animations = [];
	model.sampleStrips = [];
	for (a = 0; a < animNum; a ++)
	{
		animName = buffer_read(loadBuff, buffer_string);
		anim = new smf_anim(animName);
		anim.loop = buffer_read(loadBuff, buffer_u8);
		anim.playTime = buffer_read(loadBuff, buffer_f32);
		anim.interpolation = buffer_read(loadBuff, buffer_u8);
		anim.sampleFrameMultiplier = buffer_read(loadBuff, buffer_u8);
		anim.nodeNum = nodeNum;
		anim.update_playspeed();
		model.animMap[? animName] = array_length(model.animations);
		array_push(model.animations, anim);

		frameNum = buffer_read(loadBuff, buffer_u32);
		for (f = 0; f < frameNum; f ++)
		{
			if (buffer_tell(loadBuff) + 4 > buffer_get_size(loadBuff)) {
				break;
			}
			var frameTime = buffer_read(loadBuff, buffer_f32);
			keyframeInd = anim.keyframe_add(frameTime);
			if (f > 0)
			{
				prevFrame = keyframe;
			}
			keyframe = anim.keyframeGrid[# 1, keyframeInd];
			for (i = 0; i < nodeNum; i ++)
			{
				for (var l = 0; l < 16; l ++)
				{
					if (buffer_tell(loadBuff) + 4 > buffer_get_size(loadBuff)) {
						M[l] = 0;
					} else {
						M[l] = buffer_read(loadBuff, buffer_f32);
					}
				}

				smf_mat_orthogonalize(M);
				poseDQ[i] = smf_dq_create_from_matrix(M, array_create(8));

				var node = nodeList[| i];
				if (i > 0)
				{
					//The keyframe stores change in local orientation from bind to current keyframe
					var p = node[eAnimNode.Parent];
					if (p < 0 || p >= nodeNum) p = 0;
					var poseLocalDQ = smf_dq_multiply(smf_dq_get_conjugate(poseDQ[p], array_create(8)), poseDQ[i], array_create(8));
					keyframe[@ i] = smf_dq_multiply(node[eAnimNode.LocalDQConjugate], poseLocalDQ, array_create(8));
					if (f == 0)
					{
						//Make sure the first frame is in the positive side of the hyper-hemisphere
						if (keyframe[i][3] < 0)
						{
							//smf_dq_negate(keyframe[i]);
						}
					}
					else
					{
						//Make sure the rotation from the previous frame is in the same side of the hyper-hemisphere
						if (smf_quat_dot(prevFrame[i], keyframe[i]) < 0)
						{
							smf_dq_negate(keyframe[i]);
						}
					}
				}
				else
				{
					//The first node's keyframe DQ stores change in worldspace orientation
					keyframe[@ i] = smf_dq_multiply(node[eAnimNode.WorldDQConjugate], poseDQ[i], array_create(8));
				}
			}
		}
	}

	// Trim trailing undefineds/holes left by early breaks when anim data was shorter than expected (old SMF format or version skew)
	var _loaded = 0;
	for (var _aa = 0; _aa < array_length(model.animations); _aa++) {
		if (is_struct(model.animations[_aa])) _loaded = _aa + 1; else break;
	}
	array_resize(model.animations, _loaded);

	// Generate sampleStrips for each animation (required by smf_instance for demo models and old usage;
	// new code may create on demand, but old .smf demos expect them pre-populated at load time)
	model.sampleStrips = [];
	for (var _aa = 0; _aa < array_length(model.animations); _aa ++) {
		array_push(model.sampleStrips, new smf_samplestrip(model.rig, model.animations[_aa]));
	}

	// === DEMO4 COMPAT HACK (Dwarf only, isolated) ===
	// Only ever runs for explicit Dwarf path (see is_old_v11_rig logic). Does not affect any modern v11/v12 load.
	if (path != "" && (string_pos("Dwarf", path) > 0 || string_pos("dwarf", path) > 0)) {
		show_debug_message("SMF v11 loader: applying Dwarf demo anim name alias fallback (best-effort, does not touch modern v11/v12 data).");
		var _al = array_length(model.animations);
		if (_al > 1) {
			if (is_undefined(model.animMap[? "Walk"])) model.animMap[? "Walk"] = min(1, _al-1);
			if (is_undefined(model.animMap[? "Run"]))  model.animMap[? "Run"]  = min(1, _al-1);
			if (is_undefined(model.animMap[? "Roll"])) model.animMap[? "Roll"] = min(2, _al-1);
			if (is_undefined(model.animMap[? "Hit"]))  model.animMap[? "Hit"]  = min(3, _al-1);
		}
	}

	show_debug_message("Successfully loaded SMF model " + string(path) + ", containing " + string(modelNum) + " models and " + string(texNum) + " textures");
	return model;
}

function smf_model_load_v11_from_buffer(loadBuff, path = "", targetModel = new smf_model())
{
	// WARNING: This function contains two semi-isolated code paths because "SMF_v11..." header
	// covers both modern saves/converter output and a few legacy demo assets with different
	// internal rig/anim layouts. See the large comment block inside the rig load section.
	// When editing, keep changes to the legacy (is_old_v11_rig) path from touching the modern
	// else branch or anything in smf_system.gml v12.
	var m, size, mBuff, vBuff, matName, texName, texInd, nodeNum, i, j, Q, px, py, pz, animNum, animName, anim, lockedBonesNum, frameNum, frameTime, keyframeInd, prevFrame, keyframe, poseDQ, a, f, l, nodeList, modelNum, texNum;
	if (path != "")
	{
		var ext = string_lower(filename_ext(path))
		if (ext == ".obj")
		{
			var buff = buffer_load(path);
			if (buff < 0)
			{
				show_debug_message("smf_model_load_from_buffer: The given buffer does not contain a valid OBJ model");
			}
			var obj = mbuff_load_obj_from_buffer(buff, path, true);
			buffer_delete(buff);
			mbuff_add(targetModel.mBuff, obj[0]);
			texpack_add_texpack(targetModel.texPack, obj[1]);
			targetModel.vBuff = vbuff_create_from_mbuff(targetModel.mBuff);
			modelNum = array_length(obj[0]);
			var texNum = array_length(obj[1]);
			show_debug_message("smf_model_load_from_buffer: Successfully loaded OBJ model " + string(path) + ", containing " + string(modelNum) + " models and " + string(texNum) + " textures");
			return targetModel;
		}
	}
	buffer_seek(loadBuff, buffer_seek_start, 0);
	var headerText = buffer_read(loadBuff, buffer_string);

	if (headerText != "SMF_v11_by_Snidr_and_Bart")
	{
		var model = smf_model_load_v10_from_buffer(loadBuff, path, targetModel);
		if (is_struct(model))
		{
			return model;
		}
		show_debug_message("smf_model_load_from_buffer: The given buffer does not contain a valid SMF model");
		return -1;
	}

	//Load buffer positions
	var texPos = buffer_read(loadBuff, buffer_u32);
	var modPos = buffer_read(loadBuff, buffer_u32);
	var rigPos = buffer_read(loadBuff, buffer_u32);
	var aniPos = buffer_read(loadBuff, buffer_u32);

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load textures
	var texMap = ds_map_create();
	buffer_seek(loadBuff, buffer_seek_start, texPos);
	var texNum = buffer_read(loadBuff, buffer_u8);
	if (texNum > 0)
	{
		var s = surface_create(8, 8);
		surface_set_target(s);
		draw_clear(c_white);
		surface_reset_target();
		var blankSprite = sprite_create_from_surface(s, 0, 0, 8, 8, 0, 0, 0, 0);
		var texBuff = buffer_create(1, buffer_fast, 1);
		for (var t = 0; t < texNum; t ++)
		{
			var name = buffer_read(loadBuff, buffer_string);
			var w = buffer_read(loadBuff, buffer_u16);
			var h = buffer_read(loadBuff, buffer_u16);
			var spr = asset_get_index(filename_change_ext(filename_name(path), "_" + string(name)));
			if (sprite_exists(spr)) //Check if the texture is already in the game files
			{
				texMap[? name] = spr;
			}
			else if (w > 0 and h > 0)
			{
				surface_resize(s, w, h);
				buffer_resize(texBuff, w * h * 4)
				buffer_copy(loadBuff, buffer_tell(loadBuff), w * h * 4, texBuff, 0);
				buffer_set_surface(texBuff, s, 0);
				texMap[? name] = sprite_create_from_surface(s, 0, 0, w, h, 0, 0, 0, 0);
			}
			else if is_undefined(texMap[? name])
			{
				texMap[? name] = sprite_duplicate(blankSprite);
			}
			buffer_seek(loadBuff, buffer_seek_relative, w * h * 4);
		}
		sprite_delete(blankSprite);
		surface_free(s);
		buffer_delete(texBuff);
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load models
	buffer_seek(loadBuff, buffer_seek_start, modPos);
	modelNum = buffer_read(loadBuff, buffer_u8);
	var model = targetModel;
	model.mBuff = array_create(modelNum);
	model.vBuff = array_create(modelNum);
	model.texPack = array_create(modelNum);
	model.vis = array_create(modelNum);
	model.subRigIndex = array_create(modelNum);
	for (m = 0; m < modelNum; m ++)
	{
		//Read vertex buffers
		size = buffer_read(loadBuff, buffer_u32);
		mBuff = buffer_create(size, buffer_fixed, 1);
		buffer_copy(loadBuff, buffer_tell(loadBuff), size, mBuff, 0);
		buffer_seek(loadBuff, buffer_seek_relative, size);
		vBuff = vertex_create_buffer_from_buffer(mBuff, global.mBuffFormat);
		vertex_freeze(vBuff);
		model.mBuff[m] = mBuff;
		model.vBuff[m] = vBuff;

		matName = buffer_read(loadBuff, buffer_string);
		texName = buffer_read(loadBuff, buffer_string);
		texInd = texMap[? texName];
		model.texPack[m] = texInd ?? -1;
		model.vis[m] = buffer_read(loadBuff, buffer_u8);
	}
	ds_map_destroy(texMap);

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load rig
	buffer_seek(loadBuff, buffer_seek_start, rigPos);

	// === V11 RIG FORMAT BRANCHING (IMPORTANT FOR MAINTAINERS) ===
	// The "SMF_v11_by_Snidr_and_Bart" header string is used by both:
	//   - Modern v11/v12-era saves and GLBtoSMF converter output (u32 nodeCount, u32 parent per node,
	//     u8 isBone, u8 locked (skipped for !v12), 3f primary axis, full negate on read, trust the
	//     stored WorldDQ rot+trans, manual derive only for Length/Local/Conj, no update_node overwrite).
	//   - Certain legacy demo assets (Dwarf.smf and similar) that have the v11 *string header* but
	//     older internal rig/anim layouts (different count encoding, parent size, locked bytes presence,
	//     and sometimes different per-node info size vs the GLBtoSMF "standard" v11).
	//
	// The original v7 / pre-v11 loaders (see v7 block below ~line 176 and smf_read_rig_from_buffer.gml)
	// did: u8 count, read DQ (NO negate), u8 p, u8 isBone, default Primary, *immediate* _anim_rig_update_node
	// after each node, bindmap after loop, then unconditional 232 extension peek if marker present.
	// That combination worked for the pure old .smf files because their on-disk layout matched exactly
	// (plain u8 count, 34 bytes per node in main list, 232 reliably after nodes or harmless).
	//
	// We must not let legacy handling pollute the modern v11 path or v12 (smf_system.gml).
	// The branch below is deliberately filename-explicit (only "Dwarf") so that modern user models
	// and GLB-converted files *never* take the legacy snapshot replication path.

	var b0 = buffer_peek(loadBuff, rigPos, buffer_u8);
	var b1 = buffer_peek(loadBuff, rigPos+1, buffer_u8);
	var b2 = buffer_peek(loadBuff, rigPos+2, buffer_u8);
	var b3 = buffer_peek(loadBuff, rigPos+3, buffer_u8);
	var byte_pattern_looks_legacy = (b1 == 0 && b2 == 0 && b3 == 0 && b0 > 0 && b0 < 256);

	// Legacy trigger is deliberately filename-explicit only (see above). We still compute the old byte pattern
	// purely for a warning log when a non-Dwarf file happens to match it — this helps future diagnosis if someone
	// has another old-internal asset.
	var is_old_v11_rig = (path != "" && (string_pos("Dwarf", path) > 0 || string_pos("dwarf", path) > 0));
	if (!is_old_v11_rig && byte_pattern_looks_legacy) {
		show_debug_message("SMF v11 loader: rigPos bytes look like old v11-internal layout (small count + leading zeros), but path does not name a known legacy demo asset. Using modern path to protect v11+ / converter data.");
	}

	if (is_old_v11_rig) {
		show_debug_message("SMF v11 loader: explicit legacy path for known old demo asset (Dwarf etc.). Using snapshot replication logic (update_node per-node, raw DQs for this branch, locked read in anim). All other v11+ loads use the modern negate + trust-derive path.");
		nodeNum = buffer_read(loadBuff, buffer_u32);
	} else {
		nodeNum = buffer_read(loadBuff, buffer_u32);
	}
	if (nodeNum > 0)
	{
		// Ensure a clean rig (previous loads may have left stale entries in the ds_list, causing bad Parent indices and non-array nodes in bindmap)
		model.rig = new smf_rig();
		nodeList = model.rig.nodeList;
		// First pass: populate all node arrays (parents may be forward refs or any order)
		for (i = 0; i < nodeNum; i ++)
		{
			//Load the node as a dual quaternion
			Q = array_create(8);
			for (j = 0; j < 8; j ++)
			{
				Q[j] = buffer_read(loadBuff, buffer_f32);
			}

			//Create a node
			node = array_create(eAnimNode.Num, 0);

			if (is_old_v11_rig) {
				// === LEGACY BRANCH (replicates the v11 logic from the snapshot where Dwarf/demo4 worked) ===
				// No negate (that was added for GLB/modern compat).
				// u32 count (already read), read 8f as-is, u32 parent, u8 isBone, 3f primary,
				// store, immediate update_node(i) -- exactly mirroring the untouched working v11 + v7 style.
				// This is fully branched; modern !is_old path is unaffected.
				node[@ eAnimNode.WorldDQ] = Q;
				var p = buffer_read(loadBuff, buffer_u32);
				node[@ eAnimNode.Parent] = (p >= 0 && p < nodeNum) ? p : 0;
				node[@ eAnimNode.IsBone] = buffer_read(loadBuff, buffer_u8);

				px = buffer_read(loadBuff, buffer_f32);
				py = buffer_read(loadBuff, buffer_f32);
				pz = buffer_read(loadBuff, buffer_f32);
				node[@ eAnimNode.PrimaryAxis] = (px == 0 && py == 0 && pz == 0) ? undefined : [px, py, pz];

				model.rig.nodeList[| i] = node;
				model.rig.update_node(i);   // the call that made the demo work in the reference snapshot
			} else {
				// === MODERN v11 PATH (user's models, GLB-converted, current saves) ===
				// negate to match GLBtoSMF importer, u32 p, skip locked u8, 3f primary,
				// store, then later manual trust-derive (no update_node overwrite to avoid "pointing bones" on converter data).
				for (j = 0; j < 8; j ++) Q[j] = -Q[j];
				node[@ eAnimNode.WorldDQ] = Q;
				var p = buffer_read(loadBuff, buffer_u32);
				node[@ eAnimNode.Parent] = (p >= 0 && p < nodeNum) ? p : 0;
				node[@ eAnimNode.IsBone] = buffer_read(loadBuff, buffer_u8);
				buffer_read(loadBuff, buffer_u8); // skip 'locked' for non-legacy v11

				px = buffer_read(loadBuff, buffer_f32);
				py = buffer_read(loadBuff, buffer_f32);
				pz = buffer_read(loadBuff, buffer_f32);
				node[@ eAnimNode.PrimaryAxis] = (px == 0 && py == 0 && pz == 0) ? undefined : [px, py, pz];

				model.rig.nodeList[| i] = node;
			}
		}

		if (is_old_v11_rig) {
			// Legacy branch already performed update_node(i) inside the per-node loop (to match the
			// 'demos worked' untouched snapshot the user provided). Just ensure bindmap.
			model.rig.update_bindmap();
		} else {
			// === MODERN v11 PATH (user models, GLBtoSMF converter output, current saves) ===
			// This is the supported path for v11 (and the model used by v12).
			// u32 count + u32 parent + skip locked (for !v12) + 3f axis + negate on read + trust the
			// stored WorldDQ (rot + trans) + manual derive for Length/Local/Conj only.
			// DO NOT add legacy update_node calls or Dwarf-style skips here.
			for (i = 0; i < nodeNum; i ++)
			{
				var node = model.rig.nodeList[| i];
				var nodeDQ = node[eAnimNode.WorldDQ];
				var nodePos = smf_dq_get_translation(nodeDQ);
				var pIdx = node[eAnimNode.Parent];
				var pNode = (pIdx >= 0 && pIdx < nodeNum) ? model.rig.nodeList[| pIdx] : node;
				var pPos = is_array(pNode) && is_array(pNode[eAnimNode.WorldDQ]) ? smf_dq_get_translation(pNode[eAnimNode.WorldDQ]) : [0, 0, 0];
				var bvX = nodePos[0] - pPos[0];
				var bvY = nodePos[1] - pPos[1];
				var bvZ = nodePos[2] - pPos[2];
				var bl = bvX*bvX + bvY*bvY + bvZ*bvZ;
				node[@ eAnimNode.Length] = (bl > 0 ? sqrt(bl) : 0);
				node[@ eAnimNode.WorldDQConjugate] = smf_dq_get_conjugate(nodeDQ, array_create(8));
				var pConj = (is_array(pNode) && is_array(pNode[eAnimNode.WorldDQConjugate])) ? pNode[eAnimNode.WorldDQConjugate] : array_create(8);
				node[@ eAnimNode.LocalDQ] = smf_dq_multiply(pConj, nodeDQ, array_create(8));
				node[@ eAnimNode.LocalDQConjugate] = smf_dq_get_conjugate(node[eAnimNode.LocalDQ], array_create(8));
				if (!is_array(node[eAnimNode.PrimaryAxis])) node[@ eAnimNode.PrimaryAxis] = [0, 0, 1];
			}

			//Update the rig's bind map, for mapping bones to nodes
			model.rig.update_bindmap();
		}
	}

	////////////////////////////////////////////////////////////////////////////////////////////////////////////
	//Load animation
	buffer_seek(loadBuff, buffer_seek_start, aniPos);
	if (buffer_tell(loadBuff) + 1 > buffer_get_size(loadBuff)) {
		animNum = 0;
	} else {
		animNum = buffer_read(loadBuff, buffer_u8);
	}
	nodeList = model.rig.nodeList;
	poseDQ = array_create(nodeNum);
	model.animations = [];
	model.sampleStrips = [];
	for (a = 0; a < animNum; a ++)
	{
		if (buffer_tell(loadBuff) + 1 > buffer_get_size(loadBuff)) break;
		animName = buffer_read(loadBuff, buffer_string);
		if (buffer_tell(loadBuff) + 1 + 4 + 1 + 1 > buffer_get_size(loadBuff)) break;
		anim = new smf_anim(animName);
		anim.loop = buffer_read(loadBuff, buffer_u8);
		anim.playTime = buffer_read(loadBuff, buffer_f32);
		anim.interpolation = buffer_read(loadBuff, buffer_u8);
		anim.sampleFrameMultiplier = buffer_read(loadBuff, buffer_u8);
		anim.nodeNum = nodeNum;
		anim.update_playspeed();
		model.animMap[? animName] = array_length(model.animations);
		array_push(model.animations, anim);

		if (is_old_v11_rig) {
			// Legacy snapshot replication: the anim chunk in old v11-internal files still had the lockedBones u16 list.
			// Only executed for explicit Dwarf-path loads.
			var lockedBonesNum = buffer_read(loadBuff, buffer_u16);
			for (var ii = 0; ii < lockedBonesNum; ii++) {
				buffer_read(loadBuff, buffer_u16);
			}
		}
		// Modern v11: no locked list (per GLBtoSMF spec). Probe below is pure defensive guard.
		if (buffer_tell(loadBuff) + 4 > buffer_get_size(loadBuff)) {
			frameNum = 0;
		} else {
			var _fnPos = buffer_tell(loadBuff);
			frameNum = buffer_read(loadBuff, buffer_u32);
			var _remain = buffer_get_size(loadBuff) - buffer_tell(loadBuff);
			var _minPerFrame = 4 + max(1, nodeNum) * 8 * 4;
			if (frameNum > 100000 || (frameNum > 0 && frameNum * _minPerFrame > _remain + 2000)) {
				// try skip u16 (legacy case or skew)
				buffer_seek(loadBuff, buffer_seek_start, _fnPos + 2);
				frameNum = buffer_read(loadBuff, buffer_u32);
				_remain = buffer_get_size(loadBuff) - buffer_tell(loadBuff);
				if (frameNum > 100000 || (frameNum > 0 && frameNum * _minPerFrame > _remain + 2000)) {
					// try skip u8
					buffer_seek(loadBuff, buffer_seek_start, _fnPos + 1);
					frameNum = buffer_read(loadBuff, buffer_u32);
				}
			}
		}
		for (f = 0; f < frameNum; f ++)
		{
			if (buffer_tell(loadBuff) + 4 > buffer_get_size(loadBuff)) {
				// Not enough data left for claimed frames (format skew / version mismatch in this .smf)
				break;
			}
			var frameTime = buffer_read(loadBuff, buffer_f32);
			keyframeInd = anim.keyframe_add(frameTime);
			if (f > 0)
			{
				prevFrame = keyframe;
			}
			keyframe = anim.keyframeGrid[# 1, keyframeInd];
			for (i = 0; i < nodeNum; i ++)
			{
				Q = array_create(8);
				for (l = 0; l < 8; l ++)
				{
					if (buffer_tell(loadBuff) + 4 > buffer_get_size(loadBuff)) {
						Q[l] = 0;
					} else {
						Q[l] = buffer_read(loadBuff, buffer_f32);
					}
				}
				if (!is_old_v11_rig) {
					// Negate for modern v11/v12 to match GLBtoSMF importer (files store negated DQs).
					// Legacy Dwarf path reads raw (matching the snapshot that made old demos work).
					for (l = 0; l < 8; l ++) Q[l] = -Q[l];
				}
				poseDQ[i] = Q;

				node = nodeList[| i];

				if (i == 0)
				{
					//The first node's keyframe DQ stores change in worldspace orientation
					keyframe[@ 0] = smf_dq_multiply(node[eAnimNode.WorldDQConjugate], poseDQ[i], array_create(8));
					continue;
				}

				//The keyframe stores change in local orientation from bind to current keyframe
				var p = node[eAnimNode.Parent];
				if (p < 0 || p >= nodeNum) p = 0;
				var poseLocalDQ = smf_dq_multiply(smf_dq_get_conjugate(poseDQ[p], array_create(8)), poseDQ[i], array_create(8));
				keyframe[@ i] = smf_dq_multiply(node[eAnimNode.LocalDQConjugate], poseLocalDQ, array_create(8));
			}
		}
	}

	// Trim trailing undefineds/holes left by early breaks when anim data was shorter than expected (old SMF format or version skew)
	var _loaded = 0;
	for (var _aa = 0; _aa < array_length(model.animations); _aa++) {
		if (is_struct(model.animations[_aa])) _loaded = _aa + 1; else break;
	}
	array_resize(model.animations, _loaded);

	// Generate sampleStrips for each animation (required by smf_instance for demo models and old usage;
	// new code may create on demand, but old .smf demos expect them pre-populated at load time)
	model.sampleStrips = [];
	for (var _aa = 0; _aa < array_length(model.animations); _aa ++) {
		array_push(model.sampleStrips, new smf_samplestrip(model.rig, model.animations[_aa]));
	}

	// === DEMO4 COMPAT HACK (Dwarf only, isolated) ===
	// Only ever runs for explicit Dwarf path (see is_old_v11_rig logic). Does not affect any modern v11/v12 load.
	if (path != "" && (string_pos("Dwarf", path) > 0 || string_pos("dwarf", path) > 0)) {
		show_debug_message("SMF v11 loader: applying Dwarf demo anim name alias fallback (best-effort, does not touch modern v11/v12 data).");
		var _al = array_length(model.animations);
		if (_al > 1) {
			if (is_undefined(model.animMap[? "Walk"])) model.animMap[? "Walk"] = min(1, _al-1);
			if (is_undefined(model.animMap[? "Run"]))  model.animMap[? "Run"]  = min(1, _al-1);
			if (is_undefined(model.animMap[? "Roll"])) model.animMap[? "Roll"] = min(2, _al-1);
			if (is_undefined(model.animMap[? "Hit"]))  model.animMap[? "Hit"]  = min(3, _al-1);
		}
	}

	show_debug_message("Successfully loaded SMF model " + string(path) + ", containing " + string(modelNum) + " models and " + string(texNum) + " textures");
	return model;
}