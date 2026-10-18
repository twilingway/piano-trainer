"""Differentiable fixed-length arm IK plus source-corrective wrist/finger fitting."""
import json
import numpy as np
import torch
from black_solve import BlackSolver,SOURCE_JSON
from solve_smplh_pilot import tensor,rot,CHAINS
from smplh_data import evaluate_smplh
from pilot_body import KEY_ORIGIN,place_arm

def unit(v):
    return v/torch.linalg.vector_norm(v,dim=-1,keepdim=True).clamp_min(1e-12)

def frame(direction,normal):
    return torch.stack((direction,normal,torch.linalg.cross(direction,normal)),dim=-1)

class JointWristSolver(BlackSolver):
    def __init__(self,model,cases,trial):
        super().__init__(model,cases,trial)
        source=json.loads(SOURCE_JSON.read_text())
        self.original_full=np.asarray(source['poses'][0]['full_pose156']).copy();self.original_full[111:]=0.
        _,joints,meta=evaluate_smplh(model,self.original_full)
        self.original_meta=meta
        self.base=tensor(meta['v_posed'][self.raw_ids])
        body_columns=np.concatenate([np.arange((j-1)*9,j*9) for j in (17,19,21)])
        self.arm_dirs=tensor(model['posedirs'][self.raw_ids][:,:,body_columns])
        self.arm_base_rotations=tensor(meta['rotations'][[17,19,21]])
        fixed_joints=[j for j in range(37) if j not in (17,19,21)]
        self.static_r=tensor(np.einsum('vk,kij->vij',model['weights'][self.raw_ids][:,fixed_joints],meta['skinning_transforms'][fixed_joints,:3,:3]))
        self.static_t=tensor(np.einsum('vk,kj->vj',model['weights'][self.raw_ids][:,fixed_joints],meta['skinning_transforms'][fixed_joints,:3,3]))
        self.dynamic_weights=tensor(model['weights'][self.raw_ids][:,[17,19,21,*range(37,52)]])
        self.seed_t=tensor(self.wrist_targets);self.seed_r=tensor(self.root_rotations)
        self.root_shift=torch.nn.Parameter(torch.zeros((self.n,3)))
        self.root_turn=torch.nn.Parameter(torch.zeros((self.n,3)))
        self.shift_bounds=tensor([.025,.035,.020]);self.turn_bounds=tensor([.17,.17,.20])
        self.start=tensor(joints[17]);self.parent_turn=tensor(meta['global_transforms'][14,:3,:3])
        rest=self.rest_joints
        self.upper=float(np.linalg.norm(rest[19]-rest[17]));self.lower=float(np.linalg.norm(rest[21]-rest[19]))
        ru=unit(tensor(rest[19]-rest[17]));rl=unit(tensor(rest[21]-rest[19]));rn=unit(torch.linalg.cross(ru,rl))
        self.rest_lower=rl;self.rest_upper_frame=frame(ru,rn);self.rest_lower_frame=frame(rl,rn)

    def arm(self):
        shift=torch.tanh(self.root_shift)*self.shift_bounds
        turn=torch.tanh(self.root_turn)*self.turn_bounds
        target_k=self.seed_t+shift
        rk=rot([0,0,1],turn[:,2])@rot([0,1,0],turn[:,1])@rot([1,0,0],turn[:,0])@self.seed_r
        target=(tensor(KEY_ORIGIN)+target_k-self.body_translation)@self.c
        wrist=self.c.T@rk@tensor(self.h)
        delta=target-self.start;distance=torch.linalg.vector_norm(delta,dim=-1)
        axis=unit(delta)
        along=(self.upper**2-self.lower**2+distance**2)/(2*distance)
        # Clamp protects derivatives only. The explicit reach guard below and
        # independent NumPy place_arm reject unreachable targets without stretch.
        height=torch.sqrt(torch.clamp(self.upper**2-along**2,min=1e-12))
        lower_direction=(wrist@self.rest_lower[:,None]).squeeze(-1)
        neutral_elbow=target-self.lower*lower_direction
        circle=self.start+axis*along[:,None]
        pole=neutral_elbow-circle;pole=pole-axis*(pole*axis).sum(-1,keepdim=True)
        fallback=tensor([.18,0,-.28])@self.c
        fallback=fallback-axis*(fallback*axis).sum(-1,keepdim=True)
        pole=torch.where((torch.linalg.vector_norm(pole,dim=-1)<1e-8)[:,None],fallback,pole)
        elbow=self.start+axis*along[:,None]+unit(pole)*height[:,None]
        du=unit(elbow-self.start);dl=unit(target-elbow);dn=unit(torch.linalg.cross(du,dl))
        upper_r=frame(du,dn)@self.rest_upper_frame.T
        lower_r=frame(dl,dn)@self.rest_lower_frame.T
        local=torch.stack((self.parent_turn.T@upper_r,upper_r.transpose(-1,-2)@lower_r,lower_r.transpose(-1,-2)@wrist),1)
        self.current_t,self.current_r,self.arm_distance=target_k,rk,distance
        return {17:upper_r,19:lower_r,21:wrist},{17:self.start.expand(self.n,3),19:elbow,21:target},local

    def surfaces(self):
        angles,spreads=self.decoded();dips=torch.sigmoid(self.dip)*.9
        rotations={}
        for f,chain in CHAINS.items():
            for segment,joint in enumerate(chain):
                angle=angles[:,f-1,segment] if segment<2 else dips[:,f-1]
                r=rot(self.hinge_axes[f][segment],angle)
                if segment==0:r=rot([0,0,1],spreads[:,f-1])@r
                rotations[joint]=r
        h=tensor(self.h);source=h.T@torch.stack([rotations[j] for j in range(37,52)],1)@h
        gr,gt,body_local=self.arm()
        body_feature=(body_local-self.arm_base_rotations).reshape(self.n,27)
        hand_feature=(source-torch.eye(3)).reshape(self.n,135)
        posed=self.base+torch.einsum('vck,bk->bvc',self.arm_dirs,body_feature)+torch.einsum('vck,bk->bvc',self.dirs,hand_feature)
        for joint in range(37,52):
            parent=self.parents[joint];gr[joint]=gr[parent]@source[:,joint-37]
            gt[joint]=gt[parent]+(gr[parent]@tensor(self.rest_joints[joint]-self.rest_joints[parent])[:,None]).squeeze(-1)
        dynamic=[17,19,21,*range(37,52)]
        ar=torch.stack([gr[j] for j in dynamic],1)
        at=torch.stack([gt[j]-(gr[j]@tensor(self.rest_joints[j])[:,None]).squeeze(-1) for j in dynamic],1)
        wr=torch.einsum('vk,bkij->bvij',self.dynamic_weights,ar)+self.static_r
        wt=torch.einsum('vk,bkj->bvj',self.dynamic_weights,at)+self.static_t
        points=(wr@posed[...,None]).squeeze(-1)+wt
        return self.stencil.apply(points@self.c.T+self.body_translation-self.key_origin),source

    def loss(self):
        value=super().loss()
        # Search bounds are model fitting controls, not clinical joint limits.
        value+=2*(torch.tanh(self.root_shift)**2).sum()+3*(torch.tanh(self.root_turn)**2).sum()
        distance=self.arm_distance
        value+=1e5*(torch.relu(distance-(self.upper+self.lower-.001))**2+torch.relu(abs(self.upper-self.lower)+.001-distance)**2).sum()
        return value

    def sync_export_arm(self):
        with torch.no_grad():self.arm()
        self.wrist_targets=self.current_t.detach().numpy().tolist();self.root_rotations=self.current_r.detach().numpy().tolist()
        self.full_bodies=[];self.arm_reports=[]
        for i in range(self.n):
            full=self.original_full.reshape(52,3).copy()
            report=place_arm(self.model,full,self.body_translation.numpy(),'right',tensor(KEY_ORIGIN).numpy()+np.asarray(self.wrist_targets[i]),np.asarray(self.root_rotations[i]))
            self.full_bodies.append(full.ravel());self.arm_reports.append(report)
            self.seed_records[i].update(joint_wrist_search=True,shift_bounds_m=self.shift_bounds.numpy().tolist(),turn_bounds_rad=self.turn_bounds.numpy().tolist(),
                optimized_shift_m=(torch.tanh(self.root_shift[i]).detach()*self.shift_bounds).numpy().tolist(),
                optimized_turn_rad=(torch.tanh(self.root_turn[i]).detach()*self.turn_bounds).numpy().tolist(),
                arm_reach_guard_pass=abs(self.upper-self.lower)+.001<float(self.arm_distance[i])<self.upper+self.lower-.001)
