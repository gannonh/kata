  
  /gsd:add-phase
  kata-adding-phases


  ```
  
  
  
  
  
  
  
  
  Best approach:                                                                                                                                                 
                                                                                                                                                                 
  # First, commit or stash your current changes                                                                                                                  
  git add .planning/MILESTONES.md README.md                                                                                                                      
  git commit -m "CHECKPOINT BEFORE EXPERIMENTAL WORK"                                                                                                      
                                                                                                                                                                 
  # Create and switch to experimental branch from current feature branch                                                                                         
  git checkout -b feat/v0.1.5-skills-documentation-experimental                                                                                                  
                                                                                                                                                                 
  # Do your radical experiment here                                                                                                                              
  # If it works: merge back or rename branch                                                                                                                     
  # If it fails: just switch back and delete the branch                                                                                                          
                                                                                                                                                                 
  Rollback is trivial:                                                                                                                                           
  # Switch back to safe branch                                                                                                                                   
  git checkout feat/v0.1.5-skills-documentation                                                                                                                  
                                                                                                                                                                 
  # Delete experimental branch if you want                                                                                                                       
  git branch -D feat/v0.1.5-skills-documentation-experimental                                                                                                    
                                                                                                                                                                 
  Why this is better than marking a commit:                                                                                                                      
  - Clear separation: experimental work is isolated                                                                                                              
  - No risk: your current branch stays untouched                                                                                                                 
  - Easy cleanup: just delete the branch                                                                                                                         
  - No need to remember commit hashes                                                                                                                            
  - Can switch back and forth easily to compare                                                                                                                  
                                                                                                                                                                 
  Alternative if you want to keep both approaches visible:                                                                                                       
  # Tag current state before branching                                                                                                                           
  git tag safe-point                                                                                                                                             
                                                                                                                                                                 
  # Later, can always return to tag                                                                                                                              
  git checkout safe-point                                                                                                                                        
  git checkout -b recovery-branch                                                                                                                                
                                                                                                                                                                 
  The branch approach is cleaner though. What's the radical thing you're planning to try? 